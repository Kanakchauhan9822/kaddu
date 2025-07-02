import { log, set, get, resetPro, resetRuntime, verify } from "/js/utils.js";
import { devices } from "/js/devices.js";
import "/js/stats.js";

let config = {
	search: {
		desk: 10,
		mob: 0,
		min: 15,
		max: 30,
	},
	schedule: {
		desk: 0,
		mob: 0,
		min: 15,
		max: 30,
		mode: "m1",
	},
	device: {
		name: "",
		ua: "",
		h: 844,
		w: 390,
		scale: 3,
	},
	control: {
		niche: "random",
		consent: 0,
		clear: 0,
		act: 0,
		log: 0,
	},
	runtime: {
		done: 0,
		total: 0,
		failed: 0,
		running: 0,
		rsaTab: null,
		mobile: 0,
		act: 0,
	},
	user: {
		country: "",
		countryCode: "",
		city: "",
	},
	pro: {
		key: "",
		seats: 0,
	},
};

// Utility function to get random delay based on user settings
function getRandomDelay(minSeconds, maxSeconds) {
	const min = Math.max(1, Number(minSeconds) || 1);
	const max = Math.max(min, Number(maxSeconds) || min);
	const randomSeconds = Math.random() * (max - min) + min;
	return Math.floor(randomSeconds * 1000); // Convert to milliseconds
}

// Utility function to wait for specified milliseconds
function delay(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

async function updateConfig() {
	const storedConfig = await get();
	if (storedConfig) {
		Object.assign(config, storedConfig);
	}
	const logs = config?.control?.log;
	logs && log("[CONFIG] Configuration updated from storage", "update");
}

async function performSearch(query, mobile = false) {
	const logs = config?.control?.log;
	try {
		// Get current active tab
		const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
		
		// Create or update the search tab
		let tab;
		if (config.runtime.rsaTab) {
			try {
				tab = await chrome.tabs.get(config.runtime.rsaTab);
				await chrome.tabs.update(tab.id, { 
					url: "https://www.bing.com",
					active: false 
				});
			} catch (error) {
				// Tab doesn't exist, create new one
				tab = await chrome.tabs.create({ 
					url: "https://www.bing.com",
					active: false 
				});
				config.runtime.rsaTab = tab.id;
				await set(config);
			}
		} else {
			tab = await chrome.tabs.create({ 
				url: "https://www.bing.com",
				active: false 
			});
			config.runtime.rsaTab = tab.id;
			await set(config);
		}

		// Wait for tab to load
		await new Promise(resolve => {
			const listener = (tabId, changeInfo) => {
				if (tabId === tab.id && changeInfo.status === 'complete') {
					chrome.tabs.onUpdated.removeListener(listener);
					resolve();
				}
			};
			chrome.tabs.onUpdated.addListener(listener);
		});

		// Small delay to ensure page is fully loaded
		await delay(2000);

		// Login if needed
		const loginResult = await chrome.tabs.sendMessage(tab.id, {
			action: "login",
			mobile: mobile
		});

		if (!loginResult?.success) {
			logs && log(`[SEARCH] Login failed for ${mobile ? 'mobile' : 'desktop'}`, "error");
			return false;
		}

		// Wait a bit after login
		await delay(1000);

		// Close any popups
		await chrome.tabs.sendMessage(tab.id, {
			action: "closePopups"
		});

		// Wait before entering query
		await delay(500);

		// Enter the search query
		const queryResult = await chrome.tabs.sendMessage(tab.id, {
			action: "query",
			query: query
		});

		if (!queryResult?.success) {
			logs && log(`[SEARCH] Failed to enter query: ${query}`, "error");
			return false;
		}

		// Wait before performing search
		await delay(1000);

		// Perform the search
		const searchResult = await chrome.tabs.sendMessage(tab.id, {
			action: "perform",
			query: query
		});

		if (!searchResult?.success) {
			logs && log(`[SEARCH] Failed to perform search: ${query}`, "error");
			return false;
		}

		// Wait for search results to load
		await delay(3000);

		logs && log(`[SEARCH] Successfully completed search: ${query} (${mobile ? 'mobile' : 'desktop'})`, "success");
		return true;

	} catch (error) {
		logs && log(`[SEARCH] Error performing search: ${error.message}`, "error");
		return false;
	}
}

async function getSearchQueries(count, niche = "random") {
	const logs = config?.control?.log;
	try {
		// Import queries dynamically
		const { queries } = await import("/js/queries.js");
		
		let selectedQueries;
		if (niche === "random" || !queries[niche]) {
			// Get random queries from all categories
			const allQueries = Object.values(queries).flat();
			selectedQueries = [];
			for (let i = 0; i < count; i++) {
				const randomQuery = allQueries[Math.floor(Math.random() * allQueries.length)];
				selectedQueries.push(randomQuery);
			}
		} else {
			// Get queries from specific niche
			const nicheQueries = queries[niche] || queries.random;
			selectedQueries = [];
			for (let i = 0; i < count; i++) {
				const randomQuery = nicheQueries[Math.floor(Math.random() * nicheQueries.length)];
				selectedQueries.push(randomQuery);
			}
		}
		
		logs && log(`[QUERIES] Generated ${selectedQueries.length} queries for niche: ${niche}`, "update");
		return selectedQueries;
	} catch (error) {
		logs && log(`[QUERIES] Error generating queries: ${error.message}`, "error");
		// Fallback queries
		return Array.from({ length: count }, (_, i) => `search query ${i + 1}`);
	}
}

async function simulateDevice(enable = true) {
	const logs = config?.control?.log;
	try {
		if (!config.runtime.rsaTab) {
			logs && log("[SIMULATE] No active tab to simulate", "error");
			return false;
		}

		if (enable) {
			// Attach debugger
			await chrome.debugger.attach({ tabId: config.runtime.rsaTab }, "1.3");
			
			// Set device metrics
			await chrome.debugger.sendCommand(
				{ tabId: config.runtime.rsaTab },
				"Emulation.setDeviceMetricsOverride",
				{
					width: config.device.w,
					height: config.device.h,
					deviceScaleFactor: config.device.scale,
					mobile: true,
					fitWindow: false,
				}
			);

			// Set user agent
			await chrome.debugger.sendCommand(
				{ tabId: config.runtime.rsaTab },
				"Emulation.setUserAgentOverride",
				{
					userAgent: config.device.ua,
				}
			);

			logs && log(`[SIMULATE] Device simulation enabled: ${config.device.name}`, "success");
		} else {
			// Detach debugger
			await chrome.debugger.detach({ tabId: config.runtime.rsaTab });
			logs && log("[SIMULATE] Device simulation disabled", "success");
		}

		return true;
	} catch (error) {
		logs && log(`[SIMULATE] Error ${enable ? 'enabling' : 'disabling'} simulation: ${error.message}`, "error");
		return false;
	}
}

async function performSearches(isScheduled = false) {
	await updateConfig();
	const logs = config?.control?.log;
	
	if (config.runtime.running) {
		logs && log("[SEARCH] Search already running", "warning");
		return { success: false, message: "Search already running" };
	}

	try {
		// Determine which config to use
		const searchConfig = isScheduled ? config.schedule : config.search;
		const deskCount = Number(searchConfig.desk) || 0;
		const mobCount = Number(searchConfig.mob) || 0;
		const totalSearches = deskCount + mobCount;

		if (totalSearches === 0) {
			logs && log("[SEARCH] No searches configured", "warning");
			return { success: false, message: "No searches configured" };
		}

		// Update runtime state
		config.runtime.running = 1;
		config.runtime.total = totalSearches;
		config.runtime.done = 0;
		config.runtime.failed = 0;
		await set(config);

		logs && log(`[SEARCH] Starting ${totalSearches} searches (${deskCount} desktop, ${mobCount} mobile)`, "update");

		// Get search queries
		const queries = await getSearchQueries(totalSearches, config.control.niche);

		let queryIndex = 0;

		// Perform desktop searches
		if (deskCount > 0) {
			logs && log(`[SEARCH] Starting ${deskCount} desktop searches`, "update");
			
			// Ensure desktop mode (no simulation)
			if (config.runtime.mobile) {
				await simulateDevice(false);
				config.runtime.mobile = 0;
				await set(config);
			}

			for (let i = 0; i < deskCount; i++) {
				if (!config.runtime.running) {
					logs && log("[SEARCH] Search stopped by user", "warning");
					break;
				}

				const query = queries[queryIndex++];
				logs && log(`[SEARCH] Desktop search ${i + 1}/${deskCount}: ${query}`, "update");

				const success = await performSearch(query, false);
				
				config.runtime.done++;
				if (!success) {
					config.runtime.failed++;
				}
				await set(config);

				// Apply user-defined delay between searches (except for last search)
				if (i < deskCount - 1 || mobCount > 0) {
					const delayMs = getRandomDelay(searchConfig.min, searchConfig.max);
					logs && log(`[SEARCH] Waiting ${(delayMs/1000).toFixed(1)} seconds before next search`, "update");
					await delay(delayMs);
				}
			}
		}

		// Perform mobile searches
		if (mobCount > 0 && config.runtime.running) {
			logs && log(`[SEARCH] Starting ${mobCount} mobile searches`, "update");
			
			// Enable mobile simulation
			if (!config.runtime.mobile) {
				await simulateDevice(true);
				config.runtime.mobile = 1;
				await set(config);
			}

			for (let i = 0; i < mobCount; i++) {
				if (!config.runtime.running) {
					logs && log("[SEARCH] Search stopped by user", "warning");
					break;
				}

				const query = queries[queryIndex++];
				logs && log(`[SEARCH] Mobile search ${i + 1}/${mobCount}: ${query}`, "update");

				const success = await performSearch(query, true);
				
				config.runtime.done++;
				if (!success) {
					config.runtime.failed++;
				}
				await set(config);

				// Apply user-defined delay between searches (except for last search)
				if (i < mobCount - 1) {
					const delayMs = getRandomDelay(searchConfig.min, searchConfig.max);
					logs && log(`[SEARCH] Waiting ${(delayMs/1000).toFixed(1)} seconds before next search`, "update");
					await delay(delayMs);
				}
			}
		}

		// Complete the search session
		config.runtime.running = 0;
		await set(config);

		const successCount = config.runtime.done - config.runtime.failed;
		logs && log(`[SEARCH] Completed: ${successCount}/${totalSearches} successful searches`, "success");

		// Perform activities if enabled
		if (config.control.act && successCount > 0) {
			logs && log("[SEARCH] Starting automated activities", "update");
			await performActivities();
		}

		return { 
			success: true, 
			message: `Completed ${successCount}/${totalSearches} searches`,
			stats: {
				total: totalSearches,
				completed: config.runtime.done,
				successful: successCount,
				failed: config.runtime.failed
			}
		};

	} catch (error) {
		config.runtime.running = 0;
		await set(config);
		logs && log(`[SEARCH] Error during search execution: ${error.message}`, "error");
		return { success: false, message: error.message };
	}
}

async function performActivities() {
	const logs = config?.control?.log;
	try {
		config.runtime.act = 1;
		await set(config);

		if (!config.runtime.rsaTab) {
			logs && log("[ACTIVITY] No active tab for activities", "error");
			return false;
		}

		// Navigate to rewards page
		await chrome.tabs.update(config.runtime.rsaTab, {
			url: "https://rewards.bing.com",
			active: false
		});

		// Wait for page to load
		await delay(5000);

		// Simple activity simulation - just visit the page and wait
		logs && log("[ACTIVITY] Visited rewards page", "update");
		
		// Wait on rewards page
		await delay(10000);

		config.runtime.act = 0;
		await set(config);

		logs && log("[ACTIVITY] Activities completed", "success");
		return true;

	} catch (error) {
		config.runtime.act = 0;
		await set(config);
		logs && log(`[ACTIVITY] Error performing activities: ${error.message}`, "error");
		return false;
	}
}

async function stopSearches() {
	const logs = config?.control?.log;
	try {
		config.runtime.running = 0;
		config.runtime.act = 0;
		await set(config);
		
		logs && log("[STOP] Search execution stopped", "success");
		return { success: true, message: "Search stopped" };
	} catch (error) {
		logs && log(`[STOP] Error stopping search: ${error.message}`, "error");
		return { success: false, message: error.message };
	}
}

async function clearBrowsingData() {
	const logs = config?.control?.log;
	try {
		await chrome.browsingData.remove({
			origins: ["https://www.bing.com", "https://bing.com"]
		}, {
			cache: true,
			cookies: true,
			history: true,
			localStorage: true,
			sessionStorage: true,
			indexedDB: true,
			webSQL: true
		});

		logs && log("[CLEAR] Bing browsing data cleared", "success");
		return { success: true, message: "Browsing data cleared" };
	} catch (error) {
		logs && log(`[CLEAR] Error clearing browsing data: ${error.message}`, "error");
		return { success: false, message: error.message };
	}
}

// Message handler
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
	(async () => {
		await updateConfig();
		const logs = config?.control?.log;

		try {
			switch (request.action) {
				case "start":
					const startResult = await performSearches(false);
					sendResponse(startResult);
					break;

				case "schedule":
					const scheduleResult = await performSearches(true);
					sendResponse(scheduleResult);
					break;

				case "stop":
					const stopResult = await stopSearches();
					sendResponse(stopResult);
					break;

				case "activity":
					const activityResult = await performActivities();
					sendResponse({ success: activityResult });
					break;

				case "clearBrowsingData":
					const clearResult = await clearBrowsingData();
					sendResponse(clearResult);
					break;

				case "simulate":
					const simulateResult = await simulateDevice(!config.runtime.mobile);
					if (simulateResult) {
						config.runtime.mobile = config.runtime.mobile ? 0 : 1;
						await set(config);
					}
					sendResponse({ success: simulateResult });
					break;

				default:
					logs && log(`[MESSAGE] Unknown action: ${request.action}`, "warning");
					sendResponse({ success: false, message: "Unknown action" });
			}
		} catch (error) {
			logs && log(`[MESSAGE] Error handling message: ${error.message}`, "error");
			sendResponse({ success: false, message: error.message });
		}
	})();
	return true; // Keep sendResponse alive for async operations
});

// Alarm handler for scheduled searches
chrome.alarms.onAlarm.addListener(async (alarm) => {
	if (alarm.name === "schedule") {
		await updateConfig();
		const logs = config?.control?.log;
		
		logs && log("[SCHEDULE] Alarm triggered, starting scheduled search", "update");
		await performSearches(true);

		// Reschedule based on mode
		if (config.schedule.mode === "m3") {
			const randomDelay = Math.floor(Math.random() * 150) + 300; // 5-7.5 minutes
			await chrome.alarms.create("schedule", {
				when: Date.now() + randomDelay * 1000,
			});
		} else if (config.schedule.mode === "m4") {
			const randomDelay = Math.floor(Math.random() * 150) + 900; // 15-17.5 minutes
			await chrome.alarms.create("schedule", {
				when: Date.now() + randomDelay * 1000,
			});
		}
	}
});

// Startup handler
chrome.runtime.onStartup.addListener(async () => {
	await updateConfig();
	const logs = config?.control?.log;
	
	if (config.schedule.mode === "m2") {
		logs && log("[STARTUP] Starting scheduled search on browser startup", "update");
		// Add small delay before starting
		setTimeout(() => performSearches(true), 5000);
	}
});

// Install handler
chrome.runtime.onInstalled.addListener(async () => {
	await updateConfig();
	const logs = config?.control?.log;
	logs && log("[INSTALL] Extension installed/updated", "update");
});

// Initialize
(async () => {
	await updateConfig();
	const logs = config?.control?.log;
	logs && log("[INIT] Service worker initialized", "update");
})();