import axios from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';
import { Cheerio, Element, load } from 'cheerio'
import prompts from 'prompts';
import fs from 'fs'
import { AdifFormatter } from 'adif-parser-ts'

const jar = new CookieJar();
const client = wrapper(axios.create({ jar }));

const loginURL = 'https://www.qrz.com/login'
const logBookURL = 'http://logbook.qrz.com'

const rowDecoding = [
    [],

    [ {type: 'single', find: 'QSO Start', save: 'qso_date'}, {type: 'single', find: 'Confirmed', save: 'qsl_rcvd'} ],

    [ {type: 'single', find: 'QSO End', save: 'qso_date_off'} ],

    [], [], [], [], [], //Skip unused rows

    [ {type: 'double', find: 'Station', saveTO: 'call', saveFROM: 'station_callsign' } ],

    [], [], [], [],

    [ {type: 'quad', find: 'Frequency', saveTO: 'freq', saveFROM: 'freq_rx', 
                     find2: 'Mode', save2TO: 'mode', save2FROM: 'mode'}],

    [ {type: 'quad', find: 'Power', saveTO: 'pwr', saveFROM: 'tx_pwr', 
                     find2: 'RST', save2TO: 'rst_rcvd', save2FROM: 'rst_sent'}],

    [],

    [ {type: 'quad', find: 'Grid', saveTO: 'gridsquare', saveFROM: 'my_gridsquare', 
                     find2: 'Distance', save2TO: 'distance', save2FROM: 'distance'}],
]

function findWithString(element: Cheerio<Element>, s: string) {
    return element.filter(function() {
        return $(this).text().trim().startsWith(s)
    }).first()
}

function getTextOnly(element: Cheerio<Element>) {
    return element.contents().filter(function() {
        return this.type === 'text';
    }).text().trim()
}

function decodeRow(row: Cheerio<Element>, i: number, data: any) {
    for (const ins of rowDecoding[i]) {
        switch (ins.type) {
            case 'single': {
                const tIns = (ins as singleType)

                data[tIns.save] = findWithString(row, tIns.find).next().text()  
            } break;

            case 'double': {
                const tIns = (ins as doubleType)

                const found = findWithString(row, tIns.find)
                data[tIns.saveTO] = found.next().text()
                data[tIns.saveFROM] = found.next().next().text()
            } break;

            case 'quad': {
                const tIns = (ins as quadType)

                const first = findWithString(row, tIns.find)
                data[tIns.saveTO] = getTextOnly(first.next())                  

                const second = findWithString(row, tIns.find2)
                data[tIns.save2TO] = second.next().text()
                data[tIns.saveFROM] = getTextOnly(second.next().next())
                data[tIns.save2FROM] = row.last().text()
            } break;
        }
    }
}

function removeAfterSpace(fields: string[], data: {[key: string]: string}) {
    fields.forEach(field => {
        data[field] = data[field].split(' ')[0]
    })
}

function convertDate(input: string, date: string, time: string, data: {[key: string]: string} ) {
    const startDate = new Date(data[input])
    data[date] = startDate.toISOString().slice(0,10).replace(/-/g, '')
    data[time] = startDate.toISOString().slice(11,16).replace(/:/g, '')
}

function replaceØ(fields: string[], data: {[key: string]: string}) {
    fields.forEach(field => {
        data[field] = data[field].replaceAll('Ø','0')
    })
}

function convertDecodedDataToRecord(data: {[key: string]: string}) {
    //Remove unit from freq and pwr
    removeAfterSpace(['freq', 'freq_rx', 'pwr', 'tx_pwr'], data)

    delete data['distance'];
    delete data['pwr'];
    
    //Covert dates and add time property
    convertDate('qso_date', 'qso_date', 'time_on', data)
    convertDate('qso_date_off', 'qso_date_off', 'time_off', data)

    //Replace Ø with normal 0
    replaceØ(['call', 'station_callsign'], data)

    //Set qsl_rcvd
    if(data['qsl_rcvd'] == 'no') data['qsl_rcvd'] = 'n'
    else data['qsl_rcvd'] = 'y'

    return data
}

const response = await prompts([
    { 
        type: 'text',
        name: 'username',
        message: 'Your QRZ username'
    },
    {
        type: 'password',
        name: 'password',
        message: 'Your QRZ password'
    }
]);

//Login
await client.post(loginURL, new URLSearchParams({
    username: response.username,
    password: response.password
}))

//Find all logbooks
let $ = load((await client.post(logBookURL)).data)

const bookIds = $("option[id^='booksel']").map(function() {
    return $(this).attr('id').replace('booksel', '')
}).toArray()

console.log(`Found ${bookIds.length} logbooks.`)

//Convert each logbook to ADIF
bookIds.forEach(async bookId => {
    $ = load((await client.post(logBookURL, new URLSearchParams({bookid: bookId}))).data)
    const qsoNumber = Number($("input[id='logcount']").val())

    console.log(`Found ${qsoNumber} qsos in logbook ${bookId}`);
    
    const records = []
 
    for(let i = 0; i < qsoNumber; i++) {
        console.log(`Fetching qso number ${i}`);

        $ = load((await client.post(logBookURL, new URLSearchParams({
            op: 'show', 
            bookid: bookId, 
            logpos: i.toString()
        }))).data)

        const decodedData = {}
        $(".recordTable tr").each(function(i: number) {
            if(!rowDecoding[i]) return
            
            decodeRow($(this).children(), i, decodedData)
        })

        if(Object.keys(decodedData).length === 0) {
            console.log(`Couldnt decode QSO number ${i} data. Aborting this logbook decode.`)
            return
        } 

        records.push(convertDecodedDataToRecord(decodedData))
    }

    fs.promises.writeFile(`${bookId}.adi`, AdifFormatter.formatAdi({records: records}))
    console.log(`Wrote adi file for logbook ${bookId}`)
})

type singleType = {type: string, find: string, save: string};
type doubleType = {type: string, find: string, saveTO: string, saveFROM: string};
type quadType = {type: string, find: string, saveTO: string, saveFROM: string, find2: string, save2TO: string, save2FROM: string};
