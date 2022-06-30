# qrz-scraper
Simple web scraper used to extract QSO data from QRZ.com. 
As of now it exports only these fields: 
`gso_date, gso_date_off, call, station_callsign, freq, mode, freq_rx, tx_pwr, rst_rcvd, rst_sent, gridsquare, my_gridsquare, time_on, time_off, qsl_rcvd`
This is enough information to properly inport the logbook into ClubLog.

## Usage
```
git clone https://github.com/stopnoanime/qrz-scraper
cd qrz-scraper
npm i
npm start
```

Then follow the instructions shown on screen. The logbooks will be outputted to repo root directory under "logbookID.adi"


### This is just a web scraper, and it might stop working anytime. Comes with absolutly no warranty, but improvements are welcome.
