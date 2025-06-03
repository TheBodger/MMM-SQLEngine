Module.register("MMM-SQLEngine", {

	defaults: {
		consumerids: ["MMFC1"],
		id: "MMSE1",
		payloadType: "RSS", //options RSS or NDTF
		showDOM: false, // show the data created in the on the MM display, location must be added into the module config if true otherwise MM will error out
	},

	/**
	 * Apply the default styles.
	 */
	//getStyles() {
	//	return ["template.css"]
	//},

	getScripts: function () {
		return [
			this.file('../MMM-Provider-Consumer-utils/payload.js'), // this file will be loaded straight from the module folder.
		]
	},

	/**
	 * Pseudo-constructor for our module. Initialize stuff here.
	 */
	start() {
		this.sendNotificationToNodeHelper("CONFIG", { moduleinstance: this.identifier, config: this.config });
		this.sendNotificationToNodeHelper("STATUS", { moduleinstance: this.identifier });
	},

	//wait for all modules to be loaded before announcing we are ready

	announceReady: function (consumerID) {
		this.sendNotification('CONSUMER', consumerID);
	},

	/**
	 * Handle notifications received by the node helper.
	 * So we can communicate between the node helper and the module.
	 *
	 * @param {string} notification - The notification identifier.
	 * @param {any} payload - The payload data`returned by the node helper.
	 */
	socketNotificationReceived: function (notification, payload) {

		if (notification === "NEW_DATA") {
			if (this.identifier == payload.TargetInstanceID) { //only process updates that are for this module instance

				if (this.config.showDOM) {
					this.templateContent = `${JSON.stringify(payload.Payload)}`;
					this.updateDom();
				}

				//convert the node format payload to a consumer format payload
				var modulePayload = new InterModulePayload();
				modulePayload.SourceID = this.identifier; // the module instance that is sending the payload
				modulePayload.TargetID = this.config.consumerids[0]; // the module instance that is receiving the payload / may be a list of them !!
				modulePayload.PayloadType = payload.PayloadType; //options RSS or NDTF
				modulePayload.Payload = payload.Payload; // the payload itself, which is a JSON object

				this.sendNotification('PROVIDER_UPDATE', modulePayload);
				Log.log("Sent some new data @ ");
			}
		}
	},

	/**
	 * Render the page we're on.
	 */
	getDom() {
		const wrapper = document.createElement("div")
		wrapper.innerHTML = `<b>${this.identifier}</b><br/><p>${this.templateContent}</p>`

		return wrapper
	},

	sendNotificationToNodeHelper: function (notification, payload) {
		this.sendSocketNotification(notification, payload);
	},

	/**
	 * This is the place to receive notifications from other modules or the system.
	 *
	 * @param {string} notification The notification ID, it is preferred that it prefixes your module name
	 * @param {number} payload the payload type.
	 */
	notificationReceived(notification, payload, sender) {

		if (sender) {
			Log.log(this.name + " received a module notification: " + notification + " from sender: " + sender.name);
		} else {
			Log.log(this.name + " received a system notification: " + notification);
		}

		//if we get a notification that there is a consumer out there, if it one of our consumers, start processing
		//and mimic a response - we also want to start our cycles here - may have to handle some case of multipel restarts to a cycle
		//when we get multiple consumers to look after


		if (notification == 'DOM_OBJECTS_CREATED') { //wait until now to ensure all providers started and ready

			var self = this

			this.announceReady(this.config.id);
		}

		if (notification == 'PROVIDER_UPDATE') {
			//some one said they have data, it might be for me !

			if (payload.TargetID == this.config.id) {

				Log.log("Got some new data @ ");

				payload.moduleinstance = this.identifier; //add the module instance id to the payload

				this.sendNotificationToNodeHelper("PROCESS", payload); //send the data to the node helper

			}
		}
	}
})

