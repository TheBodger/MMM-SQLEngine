/* global Module, MMM-SQLEngine*/

/* Magic Mirror
 * Module: node_helper
 *
 * By Neil Scott
 * MIT Licensed.
 */

//if the module calls a RESET, then the date tracking is reset and all data will be sent

//nodehelper stuff:
//this.name String The name of the module

const NodeHelper = require("node_helper");
const fs = require("node:fs");
const path = require("node:path");

const Utilities = require("../MMM-Utilities/MMM-Utilities.js");
const Structures = require("../MMM-Structures/MMM-Structures.js");

//local requirements from here
const { DatabaseSync } = require("node:sqlite");

module.exports = NodeHelper.create({
	start: function () {
		this.configurations = new Structures.Configurations();
		this.payloadTracker = new Structures.PayloadTracker();
		this.debug = false;
		this.payloads = [];
		this.database = []; //will hold the database for each module instance
		this.diskDBAlias = {}; // maps moduleinstance -> sqlite ATTACH alias

		console.log(this.name + " node_helper is started!");
	},

	stop: function () {
		console.log("Shutting down node_helper");
		Object.keys(this.database).forEach((key) => {
			try {
				this.database[key].close();
			} catch (e) {}
		});
		this.connection.close();
	},

	setconfig: function (moduleinstance, config) {
		var self = this;

		this.configurations.addConfiguration(moduleinstance, config);

		this.payloadTracker.addTracker(moduleinstance);

		//as we dont know what type of data we are getting yet, the payload is left empty using a NULL payload type
		this.payloads[moduleinstance] = new Structures.NodePayload(null, moduleinstance, config.id);

		this.setupDB(moduleinstance); //do this anyway regardless of config data type
	},

	socketNotificationReceived: function (notification, payload) {
		var self = this;

		switch (notification) {
			case "CONFIG":
				this.setconfig(payload.moduleinstance, payload.config);
				break;
			case "STATUS":
				this.showstatus(payload.moduleinstance);
				break;
			case "PROCESS":
				this.process(payload.moduleinstance, payload);
				break;
		}
	},

	sendUpdate: function (notification, payload) {
		this.sendSocketNotification(notification, payload);
	},

	showstatus: function (moduleinstance) {
		console.log("============================ start of status ========================================");

		console.log("config for provider: " + moduleinstance);
		console.log(this.configurations.clone(moduleinstance));

		console.log("============================= end of status =========================================");
	},

	//example process to merge RSS items only
	mergeRSSItems(moduleinstance, payload) {
		//extract the RSS part and add it to the core data
		if (!this.payloads[moduleinstance].Payload) {
			this.payloads[moduleinstance].Payload = [];
		}

		this.payloads[moduleinstance].Payload.push(payload.Payload);
	},

	setupDB(moduleinstance) {
		this.database[moduleinstance] = new DatabaseSync(":memory:");
		this.database[moduleinstance].exec(`
		  CREATE TABLE data(
			subject TEXT,
			object TEXT,
			timestamp INTEGER, -- assuming timestamp is an integer (e.g., Unix timestamp)
			value TEXT,
			PRIMARY KEY (subject, object, timestamp)
		  ) STRICT
		`);

		const cfg = this.configurations.configuration[moduleinstance] || {};

		// Optionally persist the in-memory `data` table to an on-disk sqlite database.
		// When enabled, we attach the disk DB and keep a `data` table in sync by
		// copying rows from the in-memory `data` table after each insert batch.
		if (cfg.saveToDisk && cfg.diskDBPath) {
			const diskDBPath = String(cfg.diskDBPath);

			// Ensure parent directory exists.
			const dir = path.dirname(diskDBPath);
			if (dir && dir !== "." && dir !== path.parse(dir).root) {
				try {
					fs.mkdirSync(dir, { recursive: true });
				} catch (e) {
					console.error(`Failed creating directory for diskDBPath (${diskDBPath}):`, e);
				}
			}

			const alias =
				"diskdb_" +
				String(moduleinstance).replace(/[^A-Za-z0-9_]/g, "_"); // sqlite alias must be a valid identifier
			this.diskDBAlias[moduleinstance] = alias;

			// Escape single quotes for SQLite ATTACH DATABASE '...'
			const escapedDiskDBPath = diskDBPath.replace(/'/g, "''");

			this.database[moduleinstance].exec(`ATTACH DATABASE '${escapedDiskDBPath}' AS ${alias}`);

			this.database[moduleinstance].exec(`
				CREATE TABLE IF NOT EXISTS ${alias}.data(
					subject TEXT,
					object TEXT,
					timestamp INTEGER,
					value TEXT,
					PRIMARY KEY (subject, object, timestamp)
				) STRICT
			`);
		}

		//if the config includes a database to load, then make it available for querying
		if (this.configurations.configuration[moduleinstance].sqlParams.sqlUseDB) {
			diskDB = this.configurations.configuration[moduleinstance].sqlParams.sqlDB;
			queryDB = this.configurations.configuration[moduleinstance].sqlParams.sqlDBName;

			this.database[moduleinstance].exec(`ATTACH DATABASE '${diskDB}' AS ${queryDB}`);
		}
	},

	// Copy the in-memory `data` table to the attached on-disk DB (if enabled).
	syncMemoryTableToDisk(moduleinstance) {
		const alias = this.diskDBAlias[moduleinstance];
		if (!alias) return;

		try {
			this.database[moduleinstance].exec("BEGIN");
			this.database[moduleinstance].exec(`DELETE FROM ${alias}.data`);
			this.database[moduleinstance].exec(`
				INSERT INTO ${alias}.data(subject, object, timestamp, value)
				SELECT subject, object, timestamp, value FROM data
			`);
			this.database[moduleinstance].exec("COMMIT");
		} catch (e) {
			try {
				this.database[moduleinstance].exec("ROLLBACK");
			} catch (e2) {}
			console.error(`Failed to persist in-memory data to disk DB (${alias}):`, e);
		}
	},

	//will load the data into table(s) in mysql and then run the query.
	//as all data is sub,obj,time,value, then only one table is required BUT must be keyed on sub and obj.
	//this is blocking as it musct complete before (in this case passing the data onto the next consumer in its merged format)
	processNDTF(moduleinstance, payload) {
		//as we are adding the data each time as we are only getting changed data, we can generaly insert - however, we should determine if an update is required, possibly using
		//the timestamp of the data we receive

		const insert = this.database[moduleinstance].prepare(
			"INSERT INTO data (subject,object,timestamp,value) VALUES (?, ?, ?, ?)"
		);

		//loop through the payload and add away
		payload.Payload.NDTF.forEach(function (item) {
			//validate that the fields are ok
			//timestamp must be an integer, so convert it if needed
			if (typeof item.timestamp == "string") {
				item.timestamp = new Date(item.timestamp).getTime(); // convert to Unix timestamp
			}
			insert.run(item.subject, item.object, item.timestamp, item.value);
		});

		// Persist after each insert batch.
		this.syncMemoryTableToDisk(moduleinstance);

		const countRows = this.database[moduleinstance].prepare("select count(*) as count from data").get()
			.count;

		console.log(
			"Data inserted into database for module instance " +
				moduleinstance +
				", rows inserted:" +
				payload.Payload.NDTF.length +
				" , current data total:" +
				countRows
		);
	},

	getQueryResult(moduleinstance) {
		//return an array of merged data in NDTF format (depends on the config output type/format)
		//var query = this.database[moduleinstance].prepare("SELECT 'users' as 'subject', 'count' as 'object', timestamp, count(distinct subject) as 'value' FROM data group by timestamp");
		var query = this.database[moduleinstance].prepare(this.configurations.configuration[moduleinstance].sqlParams.sqlQuery);
		// Execute the prepared statement and log the result set.
		var res = query.all();

		if (res.length == 0) {
			console.log("Query result for module instance " + moduleinstance + ", NO DATA RETURNED FROM QUERY");
		} else {
			console.log("Query result for module instance " + moduleinstance + ", rows returned:" + res.length);
		}

		return res;
	},

	process: function (moduleinstance, payload) {
		//received a payload from the provider that needs to be processed - usually meaning some kind of aggregation
		//incoming payload is inter module payload

		//outgoing payload is node formatted payload
		//need to determine the type of payload data to correctly finish payload configuration if not configured yet
		//main module handles all the formatting

		var self = this;

		console.log("Processing payload for module instance " + moduleinstance + ", payload type:" + payload.PayloadType);

		if (!this.payloads[moduleinstance].PayloadType) {
			this.payloads[moduleinstance].PayloadType = payload.PayloadType;
		}

		//this is example that merges RSS
		if (payload.PayloadType == "RSS") {
			this.mergeRSSItems(moduleinstance, payload);
		}

		// or a simple NDTF payload
		if (payload.PayloadType == "NDTF") {
			//add the NDTF payload
			this.processNDTF(moduleinstance, payload); //prepare the data first
			//overlay the sql result into the outgoing payload
			self.payloads[moduleinstance].Payload = self.payloads[moduleinstance].addPayload(payload.PayloadType);

			//add back key info
			self.payloads[moduleinstance].Payload.JSONsource = payload.Payload.JSONsource;
			self.payloads[moduleinstance].Payload.timestamp = payload.Payload.timestamp;

			//only add the NDTF data if it is not already there
			//have to look through every row returned to add a key to track
			var NDTFItems = this.getQueryResult(moduleinstance);
			var NDTFItem = new Structures.NDTFItem();

			NDTFItems.forEach(function (item) {
				var key = NDTFItem.gethashCode(item.subject + item.object + item.timestamp); //can include value if really needed

				if (!self.payloadTracker.addItem(moduleinstance, key)) {
					self.payloads[moduleinstance].Payload.NDTF.push(item);
				}
			});
		}

		//want to send the data out as a RSS format Payload.
		//overwrites the NDTF payload from above with RSS items only for NDTF items not already sent
		if (this.configurations.configuration[moduleinstance].outputType == "RSS" && payload.PayloadType == "NDTF") {
			//add RSS payload
			var NDTFpayload = self.payloads[moduleinstance].Payload.clone();
			self.payloads[moduleinstance].Payload = new Structures.RSSPayload();
			self.payloads[moduleinstance].Payload.timestamp = NDTFpayload.timestamp;
			self.payloads[moduleinstance].Payload.RSSFeedSource = new Structures.RSSSource();
			self.payloads[moduleinstance].Payload.RSSFeedSource.title = NDTFpayload.JSONsource;
			self.payloads[moduleinstance].Payload.Items = [];
			self.payloads[moduleinstance].Payload.ItemsSent = NDTFpayload.ItemsSent;

			// create temp NDTF payload only containing items not already sent
			var tempNDTF = [];
			var NDTFItem = new Structures.NDTFItem();

			NDTFpayload.NDTF.forEach(function (item) {
				var key = NDTFItem.gethashCode(item.subject + item.object + item.timestamp); //can include value if really needed

				if (!self.payloadTracker.getItem(moduleinstance, key)) {
					tempNDTF.push(item);
					self.payloadTracker.sentItem(moduleinstance, key);
				}
			});

			self.payloads[moduleinstance].Payload = Utilities.NDTF2RSS(
				this.configurations.configuration[moduleinstance].RSSTitle,
				tempNDTF,
				NDTFpayload.JSONsource
			);
			self.payloads[moduleinstance].PayloadType = "RSS";
		} else {
			//set the keys for the basic NDTF output
			Object.entries(this.payloadTracker.getItems(moduleinstance)).forEach(function ([key, value]) {
				// key is the item id e.g. "7733779"
				// value is the sent flag e.g. false
				self.payloadTracker.sentItem(moduleinstance, key);
			});
		}

		if (
			(self.payloads[moduleinstance].Payload.Items && self.payloads[moduleinstance].Payload.Items.length > 0) ||
			(self.payloads[moduleinstance].Payload.NDTF && self.payloads[moduleinstance].Payload.NDTF.length > 0)
		) {
			this.sendUpdate("NEW_DATA", self.payloads[moduleinstance]);
		}
	},
});

