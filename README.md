# MMM-SQLEngine
Accepts JSON formatted feeds from other modules and based on paramaters can store/read other SQLLite file based DBs and apply sql rules to create an output feed in json

This magic mirror module is an MMM-xxxProvider module that is part of the MMM-Chartxxx and MMM-Feedxxx interrelated modules.

For an overview of these modules see the README.md in https://github.com/TheBodger/MMM-ChartDisplay.

MMM-SQLEngine module accepts JSON (NDTF Simple) formatted data, from another Module or local text file and stores it into SQL Lite DB files. These can then be used as input to a SQL query, the output is presented as a feed, either simple NDTF json or My RSS feed format. This data can be consumed by any other compatible modules (display or further providers.

### Warning

SQLite support in NODEjs is experimental and made available from version 22.5.0. so magic mirror needs to be started with the --experimental-sqlite flag. 

### Example
![Example of MMM-ChartProvider-JSON output being displayed](images/screenshot.png?raw=true "Example screenshot")



### Dependencies

This module requires both MMM-FeedUtilities and MMM-ChartUtilies to be installed.

Before installing this module;
		use https://github.com/TheBodger/MMM-ChartUtilities to setup the MMM-Chart... dependencies and  install all modules.
		use https://github.com/TheBodger/MMM-FeedUtilities to setup the MMM-Feed... dependencies and  install all modules.

## Installation
To install the module, use your terminal to:
1. Navigate to your MagicMirror's modules folder. If you are using the default installation directory, use the command:<br />`cd ~/MagicMirror/modules`
2. Clone the module:<br />`git clone https://github.com/TheBodger/MMM-SQLEngine`
3. This will also create a subfolder of DB that will contain any file based DBs used by SQLlite.

## Using the module

### Input feeds

The input feed(s) for this module must be provided in json and follow the definition of the NDTF format (simply a json array of data, with each set containing a subject, object, value and timestamp). Details can be found [here](https://github.com/TheBodger/MMM-ChartUtilities#ndtf---neils-or-normalised-data-transfer-format). The feed can contain one or more sets of data. 
File format feeds are best for data that changes very rarely, such as historical reference data. It is alse good for debugging other modules, ensuring that the input data is always fixed. File feed are read in when the module first runs and is **not refreshed**. 
An input feed from another module running in the current instance of MM will be processed whenever it is published and the listening SQLEngine recognises that the data is ment for this instance. 
Once the data has been read, it will be stored in a file based SQLite DB based on the configuration paramater DBAction. If the DB doesnt exist, or the DBs have been cleared at the start of the run, or the DBaction is **create**, the DB will be (re)created and the feed data inserted.
if the DB exists and the DBaction is update, then the value is updated based on matching the 3 fields subject,object and timestamp. Any sets of data not already in the DB will be added. __Note__ Data will never be deleted from a table.

### Output feed(s)

Once the feeds have been processed, the SQL is run and the output, which must only be 4 columns in the order of subject, object, timestamp and value, (if no new names are provided in the SQL) will be published based on the dataoutput_ paramaters. There can be 0,1 or2 feed outputs. The JSON format feed is compatible with other modules that expect the input in the NDTF simple format. The RSS feed format is defined in the Feed utilities and is a subset of the ATOM standards 1 and 2. This can be used by modules that expect the published feed in this format. 

#### RSS output feed

The RSS feed converts the output from the SQL into the following format to mirror the type of data found in a RSS feed as defined in the RSS item class [here](https://github.com/TheBodger/MMM-FeedUtilities/blob/master/RSS.js).

```
	id = this module id_row count from SQL query returned data set (internal count, not required in actual SQL query)
	title = subject, object @ timestamp
	description = value
	pubdate = data/time feed published
	age = 0
	imageURL = null
	source = this module id
```

### MagicMirror² Configuration

To use this module, add the following minimum configuration block to the modules array in the `config/config.js` file:
```js

{
module: "MMM-SQLEngine",
config:
	{
  	consumerids:['consumerid of MMM-SQLEngine feed'],
  	id:'unique id of this module instance',
  	datafeeds: [
    		{
      		dataseturl: "unique id of the incoming data set, either the providing module ID in format of id://moduleid or a file reference url, in the format file://filename with any required paths, which will always refer to the root of this module",  
    		},
  		],
  	sql: "Select * from 'unique id of this module instance_1'
	}
},
```

### Configuration Options

| Option                  | Details
|------------------------ |--------------
| `text`                	| *Optional* - <br><br> **Possible values:** Any string.<br> **Default value:** The Module name
| `consumerids`            | *Required* - a list of 1 or more consumer modules this module will provide for.<br><br> **Possible values:** An array of strings exactly matching the ID of one or more MMM-ChartDisplay modules <br> **Default value:** none
| `id`         | *Required* - The unique ID of this provider module<br><br> **Possible values:** any unique string<br> **Default value:** none
| `DBclear`| *Optional* - Determines if all saved DBs linked to this Module ID should be deleted befor any feeds are processed<br><br> **Possible values:** True,False <br> **Default value:** True
| `datafeeds`        | *Required* - An array of one or more data feed definitions, see below for the datafeed configuration options 
| `dataFeed Format`            |
|  `datasetid`|*Optional* -  Id of the dataset used in the SQL<br><br> **Possible values:** Any unique string. <br> **Default value:** id_n, where n = datafeed instance, i.e. first datafeed is 1, second is 2 etc
|  `dataseturl`            |*Required* -  Id of the feed<br><br> **Possible values:** Any unique string in format type:///location, where type is either id or file and location is the id of the providing module OR a filename and path relative to this modules path. <br> **Default value:** none
|  `subject`            |*Optional* - The key name of the subject field.<br><br> **Possible values:** A name that matches the incoming JSON feed subject key. <br> **Default value:** subject
|  `object`            |*Optional* - The key name of the object field.<br><br> **Possible values:** A name that matches the incoming JSON feed object key. <br> **Default value:** object
|  `value`            |*Optional* - The key name of the value field.<br><br> **Possible values:** A name that matches the incoming JSON feed value key. <br> **Default value:** value
|  `timestamp`            |*Optional* - The key name of the Timestamp field.<br><br> **Possible values:** A name that matches the incoming JSON feed timestamp key <br> **Default value:** timestamp
|  `DBaction`            |*Optional* - Action to take with the data from feed and the DB it will be stored in.<br><br> **Possible values:** create or update<br> **Default value:** create
| `End data feed format`|
| `SQL settings`|
|  `sql: `        | *Required* - the SQL query to run after all feeds have been processed that must produce an output dataset in the order of subject,object,value and timestamp, but using any name for each field.<br><br> **Possible values:** Any valid SQL combining multiple DB tables that have been loaded as part of this instance <br> **Default value:** None
|  `usememory`        | *Optional* - if the SQL should be run in memory or on the file based DB<br><br> **Possible values:** True,False <br> **Default value:** True
| `End SQL settings `|
| `dataoutput_NDTF `        | *Optional* - if the NDTF format feed should be published<br><br> **Possible values:** True,False <br> **Default value:** True
| `dataoutput_RSS `        | *Optional* - if the RSS format feed should be published<br><br> **Possible values:** True,False <br> **Default value:** False
| `filename`            |*Optional* - The filename, with path, where the output NDTF feed will be written regardless if the feed is published<br><br> **Possible values:** Any valid filename and path string <br> **Default value:** none

### Example configuration

this configuration produces a single NDTF feeds from an input feed from a module and a local file , 

```
{
  consumerids:['MMCD1'],
  id:'MMCP1',
  input: "https://opendata.ecdc.europa.eu/covid19/casedistribution/json/",
  jsonfeeds: [
    {
      setid: "CV19Pop",
      rootkey: "records",
      subject: "geoId",
      object: "population",
      value: "popData2018",
      filename: "population.json",
    },
    {
       setid:"CV19Dth",
      rootkey: "records",
      subject: "geoId",
      object: "coviddeaths",
      value: "deaths",
      type: "numeric",
      timestamp: "dateRep",
      timestampformat: "DD-MM-YYYY",
    }
  ]
}

```

### Additional Notes

This is a WIP; changes are being made all the time to improve the compatibility across the modules. Please refresh this and the MMM-feedUtilities and MMM-ChartUtilities modules with a `git pull` in the relevant modules folders.

The JSON input must be well formed and capable of being parsed with JSON.parse(). If there are errors generated whilst trying to parse the JSON, there are plenty of on-line tools that can be used to validate the feed and indicate where the issue may occur.

Look out for the correct key name/value name pairs for output purposes and a format for an input timestamp.

