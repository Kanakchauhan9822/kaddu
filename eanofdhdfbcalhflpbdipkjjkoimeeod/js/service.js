import "/js/stats.js";
import { queries } from "/js/queries.js";
import { log, set, get, resetRuntime, verify } from "/js/utils.js";
const bing = "https://www.bing.com/";
const rewards = "https://rewards.bing.com/";
const rewardsFlyout =
	"https://www.bing.com/rewards/panelflyout?channel=bingflyout&partnerId=BingRewards&ru=";
const loading = "/loading.html?type=";
const homepage = "https://buildwithkt.dev/";
// Todo: add once site is live - const tnc = "https://tnc.buildwithkt.dev/rewards-search-automator/";
const tnc =
	"https://getprojects.notion.site/Privacy-Policy-Rewards-Search-Automator-1986977bedc08080a1d2e3a70dcb29e5";
const msDomains = [
	"bing.com",
	"microsoft.com",
	"live.com",
	"office.com",
	"outlook.com",
	"msn.com",
	"windows.com",
	"azure.com",
	"xbox.com",
	"skype.com",
	"microsoftonline.com",
	"sharepoint.com",
];
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
		clear: 1,
		act: 0,
		log: 1,
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
let logs = config?.control?.log;
let needPatch = false;
let searchQuery = "";
let shortestDelay = 18000 / navigator.hardwareConcurrency;
let mediumDelay = 54000 / navigator.hardwareConcurrency;
let longestDelay = 90000 / navigator.hardwareConcurrency;

// Add profile isolation and session management
let profileId = null;
let sessionId = null;

async function initializeProfile() {
	try {
		// Generate unique profile identifier
		const tabs = await chrome.tabs.query({});
		const activeTab = tabs.find(tab => tab.active);
		profileId = `profile_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
		sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
		
		logs && log(`[PROFILE] Initialized profile: ${profileId}`, "update");
		return true;
	} catch (error) {
		log(`[PROFILE] Error initializing profile: ${error.message}`, "error");
		return false;
	}
}

async function delay(ms, interruptible = true) {
	if (ms > 1000) {
		logs &&
			log(
				`[DELAY] Waiting for ${ms}ms... (${
					interruptible ? "interruptible" : "non-interruptible"
				})`,
			);
	}
	if (!interruptible) {
		return new Promise((resolve) =>
			setTimeout(() => {
				resolve();
			}, ms),
		);
	}
	if (interruptible && !config?.runtime?.running) {
		logs && log(`[DELAY] Interrupted - not running.`, "warning");
		return false;
	}
	const checkInterval = 100;
	let resolved = false;
	const startTime = Date.now();

	return new Promise((resolve) => {
		const intervalId = setInterval(() => {
			if (!config?.runtime?.running && !resolved) {
				resolved = true;
				clearInterval(intervalId);
				clearTimeout(timeoutId);
				if (ms > 1000) {
					logs &&
						log(
							`[DELAY] Interrupted in ${
								Date.now() - startTime
							}ms.`,
							"warning",
						);
				}
				resolve();
			}
		}, checkInterval);
		const timeoutId = setTimeout(() => {
			if (!resolved) {
				resolved = true;
				clearInterval(intervalId);
			}
			resolve();
		}, ms);
	});
}

async function reverify() {
	return await verify(config?.pro?.key, config, false);
}

async function setUserGeo() {
	if (!navigator.onLine) {
		log("[USER GEO] Not online, skipping user geo setup.", "warning");
		return false;
	}
	try {
		const res = await fetch("https://ipapi.co/json/");
		if (!res.ok) {
			log("[USER GEO] Failed to fetch user geo data.", "error");
			return false;
		}
		const data = await res.json();
		config.user.country = data.country_name || "";
		config.user.countryCode = data.country_code || "";
		config.user.city = data.city || "";
		await set(config);
		logs &&
			log(
				`[USER GEO] User geo set to ${config.user.country} (${config.user.countryCode}), City: ${config.user.city}`,
				"success",
			);
		return true;
	} catch (error) {
		log(`[USER GEO] Error setting user geo: ${error.message}`, "error");
		return false;
	}
}

async function getTabUrl(tabId) {
	try {
		const tab = await chrome.tabs.get(tabId);
		return tab.url || false;
	} catch (err) {
		log(
			`[GET TAB URL] Error fetching URL for tab ${tabId}: ${err.message}`,
			"error",
		);
		return false;
	}
}

async function wait(tabId) {
	logs && log(`[WAIT] Waiting for tab ${tabId} to load...`);
	const startTime = Date.now();
	return new Promise(async (resolve) => {
		let resolved = false;
		let timer = null;

		const done = (
			success,
			message = `Tab ${tabId} loaded successfully.`,
		) => {
			if (resolved) return;
			resolved = true;
			clearTimeout(timer);
			chrome.tabs.onUpdated.removeListener(onUpdated);
			logs &&
				log(
					`[WAIT] ${message} (Took ${Date.now() - startTime}ms) - ${
						success ? "Success" : "Failed"
					}`,
				);
			resolve(success);
		};
		const onUpdated = (updatedTabId, changeInfo) => {
			if (updatedTabId !== tabId) return;
			if (changeInfo.status === "complete") done(true);
		};
		timer = setTimeout(() => {
			done(false, `Tab ${tabId} did not load within the timeout period.`);
		}, longestDelay);

		try {
			const tab = await chrome.tabs.get(tabId);
			if (tab.status === "complete") {
				done(true);
			} else {
				chrome.tabs.onUpdated.addListener(onUpdated);
			}
		} catch (error) {
			log(`[WAIT] Error getting tab ${tabId}: ${error.message}`, "error");
			done(false, `Error getting tab ${tabId}: ${error.message}`);
		}
	});
}

async function clear(interruptible = true) {
	if (interruptible && !config?.runtime?.running) {
		logs && log("[CLEAR] Interrupted, skipping clear.", "warning");
		return false;
	}
	const tabId = config?.runtime?.rsaTab;
	const originalUrl = await getTabUrl(tabId);
	if (tabId && originalUrl) {
		await chrome.tabs.update(tabId, {
			url: loading + "clear",
		});
		await wait(tabId);
		await delay(shortestDelay, interruptible);
		logs &&
			log(
				`[CLEAR] Tab updated to loading page: ${loading}clear`,
				"update",
			);
	}

	try {
		// Enhanced clearing for better session isolation
		await chrome.browsingData.remove(
			{
				origins: [bing, "https://login.microsoftonline.com", "https://account.microsoft.com"],
				since: 0,
			},
			{
				cacheStorage: true,
				cookies: true,
				serviceWorkers: true,
				localStorage: true,
				pluginData: true,
				indexedDB: true,
				webSQL: true,
			},
		);
		await delay(shortestDelay, interruptible);
		logs && log("[CLEAR] Enhanced browsing data cleared.", "success");
	} catch (error) {
		log(`[CLEAR] Error clearing browsing data: ${error.message}`, "error");
		return false;
	}

	if (tabId && originalUrl) {
		await chrome.tabs.update(tabId, {
			url: originalUrl,
		});
		await wait(tabId);
		logs &&
			log(
				`[CLEAR] Tab updated to original URL: ${originalUrl}`,
				"update",
			);
	}
	return true;
}

// WATCHER - Enhanced for better profile isolation
(async function () {
	logs &&
		log(
			`[WATCHER] - Watching tabs for MS domain navigations except RSA tab.`,
			"update",
		);
	const handleNavigation = ({ tabId, frameId, url }) => {
		tabId = Number(tabId);
		frameId = Number(frameId);
		if (tabId === config?.runtime?.rsaTab && frameId !== 0) {
			return;
		} else if (tabId === config?.runtime?.rsaTab && frameId === 0) {
			return;
		}
		if (
			url &&
			msDomains.some((domain) => url.includes(domain)) &&
			config?.runtime?.running &&
			config?.runtime?.mobile &&
			config?.control?.clear &&
			tabId !== config?.runtime?.rsaTab &&
			!config?.runtime?.act
		) {
			needPatch = true;
			logs &&
				log(
					`[WATCHER] - (Patch Required) MS domain navigation detected in tab ${tabId}: ${url}`,
					"warning",
				);
		}
	};
	chrome.webNavigation.onCommitted.addListener(handleNavigation);
})();

async function isDebuggerAttached(tabId) {
	tabId = Number(tabId);
	logs &&
		log(
			`[DEBUGGER CHECK] Checking if debugger is attached to tab ${tabId}...`,
		);
	try {
		const targets = await chrome.debugger.getTargets();
		return targets.some(
			(target) =>
				target.type === "page" &&
				target.tabId === tabId &&
				target.attached,
		);
	} catch (error) {
		log(
			`[DEBUGGER CHECK] Error checking debugger status: ${error.message}`,
			"error",
		);
		return false;
	}
}

async function race(promise, ms, errorMsg = "Operation timed out") {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => reject(new Error(errorMsg)), ms);
		promise.then(
			(res) => {
				clearTimeout(timer);
				resolve(res);
			},
			(err) => {
				clearTimeout(timer);
				reject(err);
			},
		);
	});
}

async function attach(tabId, interruptible = true) {
	if (interruptible && !config?.runtime?.running) {
		logs &&
			log(
				`[ATTACH] Interrupted, skipping attach to tab ${tabId}.`,
				"warning",
			);
		return false;
	}
	tabId = Number(tabId);
	const isAttached = await isDebuggerAttached(tabId);
	if (isAttached) {
		logs &&
			log(
				`[ATTACH] - Debugger already attached to tab ${tabId}.`,
				"update",
			);
		return true;
	}
	const originalUrl = await getTabUrl(tabId);
	logs && log(`[ATTACH] - Attaching debugger to tab ${tabId}...`, "update");

	if (!tabId || !originalUrl) {
		log(`[ATTACH] - Invalid tabId or URL. Skipping...`, "warning");
		return false;
	}

	if (tabId && originalUrl) {
		await chrome.tabs.update(tabId, {
			url: loading + "attach",
		});
		await wait(tabId);
		await delay(shortestDelay, interruptible);
		logs &&
			log(
				`[ATTACH] - Tab updated to loading page: ${loading}attach`,
				"update",
			);
	}

	try {
		await race(
			chrome.debugger.attach({ tabId }, "1.3").catch((err) => {
				if (err.message?.includes("Another debugger")) {
					log(
						`[ATTACH] - Another debugger is already attached.`,
						"warning",
					);
				}
				throw err;
			}),
			longestDelay,
		);
		logs && log(`[ATTACH] - Debugger attached to tab ${tabId}.`, "success");
		await delay(shortestDelay, interruptible);

		await race(
			chrome.debugger.sendCommand({ tabId }, "Target.setAutoAttach", {
				autoAttach: true,
				waitForDebuggerOnStart: false,
				flatten: true,
			}),
			longestDelay,
		);
		logs && log(`[ATTACH] - Auto-attach set for tab ${tabId}.`, "success");
		await delay(shortestDelay, interruptible);
	} catch (error) {
		log(`[ATTACH] - Error attaching debugger: ${error.message}`, "error");
		return false;
	}

	if (tabId && originalUrl) {
		await chrome.tabs.update(tabId, {
			url: originalUrl,
		});
		await wait(tabId);
		logs &&
			log(
				`[ATTACH] Tab updated to original URL: ${originalUrl}`,
				"update",
			);
		await delay(shortestDelay, interruptible);
	}
	return true;
}

async function simulate(tabId, interruptible = true) {
	if (interruptible && !config?.runtime?.running) {
		logs &&
			log(
				`[SIMULATE] Interrupted, skipping simulate for tab ${tabId}.`,
				"warning",
			);
		return false;
	}
	tabId = Number(tabId);
	const originalUrl = await getTabUrl(tabId);
	logs && log(`[SIMULATE] - Simulating tab ${tabId}...`, "update");

	if (!tabId || !originalUrl) {
		log(`[SIMULATE] - Invalid tabId or URL. Skipping...`, "warning");
		return false;
	}

	const attached = await isDebuggerAttached(tabId);
	if (!attached) {
		await attach(tabId, interruptible);
		await delay(shortestDelay, interruptible);
		logs &&
			log(`[SIMULATE] - Debugger attached to tab ${tabId}.`, "success");
	}

	if (tabId && originalUrl) {
		await chrome.tabs.update(tabId, {
			url: loading + "simulate",
		});
		await wait(tabId);
		logs &&
			log(
				`[SIMULATE] - Tab updated to loading page: ${loading}simulate`,
				"update",
			);
		await delay(shortestDelay, interruptible);
	}

	try {
		await race(
			chrome.debugger.sendCommand(
				{ tabId },
				"Emulation.clearDeviceMetricsOverride",
			),
			shortestDelay,
		);
		logs &&
			log(
				`[SIMULATE] - Device metrics cleared for tab ${tabId}.`,
				"success",
			);

		const deviceMetrics = {
			mobile: true,
			fitWindow: true,
			width: config.device.w,
			height: config.device.h,
			deviceScaleFactor: config.device.scale,
		};

		await race(
			chrome.debugger.sendCommand(
				{ tabId },
				"Emulation.setDeviceMetricsOverride",
				deviceMetrics,
			),
			shortestDelay,
		);
		logs &&
			log(
				`[SIMULATE] - Device metrics set for tab ${tabId}: ${JSON.stringify(
					deviceMetrics,
				)}`,
				"success",
			);

		// Enhanced user agent with profile-specific variations
		const baseUA = config?.device?.ua;
		const profileVariation = profileId ? profileId.slice(-4) : "0000";
		const enhancedUA = baseUA.replace(/Chrome\/[\d.]+/, `Chrome/120.0.${profileVariation}.0`);

		await race(
			chrome.debugger.sendCommand(
				{ tabId },
				"Network.setUserAgentOverride",
				{
					userAgent: enhancedUA,
				},
			),
			shortestDelay,
		);
		logs &&
			log(
				`[SIMULATE] - Enhanced user agent set for tab ${tabId}: ${enhancedUA}`,
				"success",
			);

		await race(
			chrome.debugger.sendCommand(
				{ tabId },
				"Network.setBypassServiceWorker",
				{ bypass: true },
			),
			shortestDelay,
		);
		logs &&
			log(
				`[SIMULATE] - Bypass service worker enabled for tab ${tabId}.`,
				"success",
			);

		await race(
			chrome.debugger.sendCommand(
				{ tabId },
				"Emulation.setTouchEmulationEnabled",
				{
					enabled: true,
					maxTouchPoints: 1,
					configuration: "mobile",
				},
			),
			shortestDelay,
		);
		logs &&
			log(
				`[SIMULATE] - Touch emulation enabled for tab ${tabId}.`,
				"success",
			);

		await race(
			chrome.debugger.sendCommand(
				{ tabId },
				"Emulation.setEmitTouchEventsForMouse",
				{
					enabled: true,
					configuration: "mobile",
				},
			),
			shortestDelay,
		);
		logs &&
			log(
				`[SIMULATE] - Mouse events set for touch for tab ${tabId}.`,
				"success",
			);
		await delay(shortestDelay, interruptible);
		logs &&
			log(
				`[SIMULATE] - Done for ${tabId} using device ${config.device.name}`,
				"update",
			);
	} catch (error) {
		log(`[SIMULATE] - Error simulating tab: ${error.message}`, "error");
		return false;
	}

	if (tabId && originalUrl) {
		await chrome.tabs.update(tabId, {
			url: originalUrl,
		});
		await wait(tabId);
		logs &&
			log(
				`[SIMULATE] Tab updated to original URL: ${originalUrl}`,
				"update",
			);
		await delay(shortestDelay, interruptible);
	}
	return true;
}

async function detach(tabId, interruptible = true) {
	if (interruptible && !config?.runtime?.running) {
		logs &&
			log(
				`[DETACH] Interrupted, skipping detach for tab ${tabId}.`,
				"warning",
			);
		return false;
	}
	tabId = Number(tabId);
	const originalUrl = await getTabUrl(tabId);

	if (!tabId || !originalUrl) {
		log(`[DETACH] - Invalid tabId or URL. Skipping...`, "warning");
		return false;
	}

	const attached = await isDebuggerAttached(tabId);
	if (!attached) {
		logs &&
			log(
				`[DETACH] - Debugger not attached to tab ${tabId}, skipping detach.`,
				"update",
			);
		return true;
	}

	logs && log(`[DETACH] - Detaching debugger from tab ${tabId}...`, "update");

	if (tabId && originalUrl) {
		await chrome.tabs.update(tabId, {
			url: loading + "detach",
		});
		await wait(tabId);
		logs &&
			log(
				`[DETACH] - Tab updated to loading page: ${loading}detach`,
				"update",
			);
		await delay(shortestDelay, interruptible);
	}

	const resetCommands = [
		["Emulation.clearDeviceMetricsOverride", {}],
		["Network.setUserAgentOverride", { userAgent: "" }],
		["Network.setBypassServiceWorker", { bypass: false }],
		["Emulation.setTouchEmulationEnabled", { enabled: false }],
		["Emulation.setEmitTouchEventsForMouse", { enabled: false }],
	];
	for (const [command, params] of resetCommands) {
		try {
			await race(
				chrome.debugger.sendCommand({ tabId }, command, params),
				shortestDelay,
			);
			logs &&
				log(
					`[DETACH] - Reset command sent: ${command} with params: ${JSON.stringify(
						params,
					)}`,
					"success",
				);
		} catch (error) {
			logs &&
				log(
					`[DETACH] - Error sending reset command ${command}: ${error.message}`,
					"error",
				);
			continue;
		}
	}
	await delay(shortestDelay, interruptible);
	try {
		await race(
			chrome.debugger.detach({ tabId }),
			mediumDelay,
			`Failed to detach debugger from tab ${tabId} within timeout.`,
		);
		logs &&
			log(`[DETACH] - Debugger detached from tab ${tabId}.`, "success");
	} catch (error) {
		log(`[DETACH] - Error detaching tab: ${error.message}`, "error");
		return false;
	}
	if (tabId && originalUrl) {
		await chrome.tabs.update(tabId, {
			url: originalUrl,
		});
		await wait(tabId);
		logs &&
			log(
				`[DETACH] Tab updated to original URL: ${originalUrl}`,
				"update",
			);
		await delay(shortestDelay, interruptible);
	}
	return true;
}

async function toggleSimulate() {
	try {
		const currentTab = await chrome.tabs.query({
			active: true,
			currentWindow: true,
		});
		const tabId = currentTab?.[0]?.id;
		if (!tabId) {
			logs && log("[TOGGLE SIMULATE] No active tab found.", "error");
			return false;
		}
		const isAttached = await isDebuggerAttached(tabId);
		if (!isAttached) {
			await attach(tabId, false);
			await delay(shortestDelay, false);
			await simulate(tabId, false);
			logs &&
				log(
					`[TOGGLE SIMULATE] Debugger attached and simulated for tab ${tabId}.`,
					"success",
				);
			return true;
		} else {
			await detach(tabId, false);
			await delay(shortestDelay, false);
			logs &&
				log(
					`[TOGGLE SIMULATE] Debugger detached from tab ${tabId}.`,
					"success",
				);
			return true;
		}
	} catch (error) {
		log(
			`[TOGGLE SIMULATE] Error toggling simulate: ${error.message}`,
			"error",
		);
		return false;
	}
}

async function enableDomains(tabId) {
	tabId = Number(tabId);
	try {
		const domains = ["Page", "Runtime", "DOM"];
		await chrome.tabs.update(tabId, {
			active: true,
		});
		for (const domain of domains) {
			await race(
				chrome.debugger.sendCommand({ tabId }, `${domain}.enable`, {}),
				shortestDelay,
				`Failed to enable ${domain} domain for tab ${tabId} within timeout.`,
			);
		}
		logs &&
			log(
				`[ENABLE DOMAINS] - Enabled domains for tab ${tabId}.`,
				"success",
			);
		await delay(shortestDelay, true);
		return true;
	} catch (error) {
		log(
			`[ENABLE DOMAINS] - Error enabling domains for tab ${tabId}: ${error.message}`,
			"error",
		);
		return false;
	}
}

// Enhanced login function with better reliability
async function ensureLogin(tabId, interruptible = true) {
	if (interruptible && !config?.runtime?.running) {
		logs && log("[LOGIN] Interrupted, skipping login check.", "warning");
		return false;
	}

	logs && log(`[LOGIN] Checking login status for tab ${tabId}...`, "update");
	
	try {
		await enableDomains(tabId);
		await delay(2000, interruptible); // Wait for page to fully load
		
		// Check if already logged in by looking for user menu or account info
		const checkLoginScript = `
			(function() {
				// Check for various login indicators
				const userMenu = document.querySelector('#id_n, .id_button, [data-bi-name="mecontrol"]');
				const signInButton = document.querySelector('#id_s, .id_signin, [data-bi-name="signin"]');
				const rewardsButton = document.querySelector('#id_rh, .id_rewards');
				
				if (userMenu && !signInButton) {
					return { loggedIn: true, method: 'userMenu' };
				}
				
				if (rewardsButton) {
					return { loggedIn: true, method: 'rewardsButton' };
				}
				
				// Check for Microsoft account indicators
				const accountInfo = document.querySelector('.msame_Header_name, .msame_TileText');
				if (accountInfo) {
					return { loggedIn: true, method: 'accountInfo' };
				}
				
				return { loggedIn: false, signInAvailable: !!signInButton };
			})()
		`;

		const { result } = await race(
			chrome.debugger.sendCommand({ tabId }, "Runtime.evaluate", {
				expression: checkLoginScript,
				returnByValue: true,
			}),
			shortestDelay,
		);

		const loginStatus = result.value;
		logs && log(`[LOGIN] Status check result: ${JSON.stringify(loginStatus)}`, "update");

		if (loginStatus.loggedIn) {
			logs && log(`[LOGIN] Already logged in via ${loginStatus.method}`, "success");
			return true;
		}

		if (!loginStatus.signInAvailable) {
			logs && log("[LOGIN] No sign-in button found, may need to navigate to login page", "warning");
			// Try navigating to Microsoft login page
			await chrome.tabs.update(tabId, {
				url: "https://login.microsoftonline.com/common/oauth2/authorize?client_id=0000000040197a6a&scope=openid%20profile%20https://graph.microsoft.com/user.read&response_type=code&redirect_uri=https://www.bing.com/fd/auth/signin"
			});
			await wait(tabId);
			await delay(3000, interruptible);
		}

		// Attempt to trigger login
		return await click(interruptible);

	} catch (error) {
		log(`[LOGIN] Error checking/ensuring login: ${error.message}`, "error");
		return false;
	}
}

async function click(interruptible = true) {
	if (interruptible && !config?.runtime?.running) {
		logs &&
			log("[CLICK] Interrupted, skipping click operation.", "warning");
		return false;
	}

	const tabId = Number(config?.runtime?.rsaTab);
	if (!tabId) {
		logs &&
			log(
				"[CLICK] No RSA tab found, skipping click operation.",
				"warning",
			);
		return false;
	}

	try {
		await enableDomains(tabId);
		
		// Enhanced selector logic for better login detection
		const selectorScript = `
			(function() {
				const mobile = ${config?.runtime?.mobile || false};
				let selector = null;
				let element = null;
				
				if (mobile) {
					// Mobile selectors in order of preference
					const mobileSelectors = [
						"#mHamburger",
						".hamburger",
						"[data-bi-name='hamburger']",
						".b_hamburger"
					];
					
					for (const sel of mobileSelectors) {
						element = document.querySelector(sel);
						if (element && element.offsetParent !== null) {
							selector = sel;
							break;
						}
					}
				} else {
					// Desktop selectors for login
					const desktopSelectors = [
						"#id_s", // Sign in button
						".id_signin",
						"[data-bi-name='signin']",
						".b_clickarea", // Fallback
						"#id_n" // User menu if already logged in
					];
					
					for (const sel of desktopSelectors) {
						element = document.querySelector(sel);
						if (element && element.offsetParent !== null) {
							selector = sel;
							break;
						}
					}
				}
				
				return { selector, found: !!element, visible: element ? element.offsetParent !== null : false };
			})()
		`;

		const { result } = await race(
			chrome.debugger.sendCommand({ tabId }, "Runtime.evaluate", {
				expression: selectorScript,
				returnByValue: true,
			}),
			shortestDelay,
		);

		const selectorInfo = result.value;
		logs && log(`[CLICK] Selector info: ${JSON.stringify(selectorInfo)}`, "update");

		if (!selectorInfo.found) {
			logs && log("[CLICK] No suitable element found for clicking", "warning");
			// Fallback to content script method
			await chrome.tabs.sendMessage(tabId, {
				action: "login",
				mobile: config?.runtime?.mobile,
			});
			return true;
		}

		const selector = selectorInfo.selector;

		const { root: documentNode } = await race(
			chrome.debugger.sendCommand({ tabId }, "DOM.getDocument"),
			shortestDelay,
			`Failed to get document for tab ${tabId} within timeout.`,
		);

		if (!documentNode || !documentNode.nodeId) {
			logs &&
				log(
					`[CLICK] - Failed to get document node for tab ${tabId}.`,
					"error",
				);
			return false;
		}

		const { nodeId } = await race(
			chrome.debugger.sendCommand({ tabId }, "DOM.querySelector", {
				nodeId: documentNode.nodeId,
				selector: selector,
			}),
			shortestDelay,
			`Failed to query selector "${selector}" for tab ${tabId} within timeout.`,
		);
		if (!nodeId) {
			logs &&
				log(
					`[CLICK] - Failed to get node ID for selector "${selector}" in tab ${tabId}.`,
					"error",
				);
			return false;
		}

		await race(
			chrome.debugger.sendCommand(
				{ tabId },
				"DOM.scrollIntoViewIfNeeded",
				{
					nodeId: nodeId,
				},
			),
			shortestDelay,
			`Failed to scroll into view for node ID ${nodeId} in tab ${tabId} within timeout.`,
		);
		await delay(shortestDelay, interruptible);

		const { model } = await race(
			chrome.debugger.sendCommand({ tabId }, "DOM.getBoxModel", {
				nodeId: nodeId,
			}),
			shortestDelay,
			`Failed to get box model for node ID ${nodeId} in tab ${tabId} within timeout.`,
		);
		if (!model) {
			logs &&
				log(
					`[CLICK] - Invalid box model for node ID ${nodeId} in tab ${tabId}.`,
					"error",
				);
			return false;
		}

		const quad = model?.content;
		const x = (quad[0] + quad[2]) / 2;
		const y = (quad[1] + quad[5]) / 2;
		logs &&
			log(
				`[CLICK] - Click coordinates for tab ${tabId}: (${x}, ${y})`,
				"update",
			);

		if (config?.runtime?.mobile) {
			await race(
				chrome.debugger.sendCommand(
					{ tabId },
					"Input.dispatchTouchEvent",
					{
						type: "touchStart",
						touchPoints: [
							{
								x,
								y,
								radiusX: 5,
								radiusY: 5,
								force: 0.5,
							},
						],
					},
				),
				shortestDelay,
				`Failed to dispatch touch event for tab ${tabId} within timeout.`,
			);
		} else {
			await race(
				chrome.debugger.sendCommand(
					{ tabId },
					"Input.dispatchMouseEvent",
					{
						type: "mouseMoved",
						button: "left",
						x,
						y,
						clickCount: 1,
					},
				),
				shortestDelay,
				`Failed to dispatch mouse event for tab ${tabId} within timeout.`,
			);
			await delay(80 + Math.random() * 120, interruptible);
			await race(
				chrome.debugger.sendCommand(
					{ tabId },
					"Input.dispatchMouseEvent",
					{
						type: "mousePressed",
						button: "left",
						x,
						y,
						clickCount: 1,
					},
				),
				shortestDelay,
				`Failed to dispatch mouse event for tab ${tabId} within timeout.`,
			);
		}
		await delay(80 + Math.random() * 120, interruptible);
		if (config?.runtime?.mobile) {
			await race(
				chrome.debugger.sendCommand(
					{ tabId },
					"Input.dispatchTouchEvent",
					{
						type: "touchEnd",
						touchPoints: [
							{
								x,
								y,
								radiusX: 5,
								radiusY: 5,
								force: 0.5,
							},
						],
					},
				),
				shortestDelay,
				`Failed to dispatch touch event for tab ${tabId} within timeout.`,
			);
		} else {
			await race(
				chrome.debugger.sendCommand(
					{ tabId },
					"Input.dispatchMouseEvent",
					{
						type: "mouseReleased",
						button: "left",
						x,
						y,
						clickCount: 1,
					},
				),
				shortestDelay,
				`Failed to dispatch mouse event for tab ${tabId} within timeout.`,
			);
		}
		logs &&
			log(
				`[CLICK] - Click operation completed for tab ${tabId}.`,
				"success",
			);
		await delay(shortestDelay, interruptible);
	} catch (error) {
		log(
			`[CLICK] - Error during click operation: ${error.message}`,
			"error",
		);
	} finally {
		logs &&
			log(
				`[CLICK] - Applying fallback method for login for tab ${tabId}.`,
				"update",
			);
		await chrome.tabs.sendMessage(tabId, {
			action: "login",
			mobile: config?.runtime?.mobile,
		});
		await delay(shortestDelay, interruptible);
		if (needPatch) {
			needPatch = false;
		}
		return true;
	}
}

async function query(interruptible = true) {
	if (interruptible && !config?.runtime?.running) {
		logs &&
			log("[QUERY] Interrupted, skipping query operation.", "warning");
		return false;
	}
	const tabId = Number(config?.runtime?.rsaTab);
	if (!tabId) {
		logs &&
			log(
				"[QUERY] No RSA tab found, skipping query operation.",
				"warning",
			);
		return false;
	}
	logs &&
		log(`[QUERY] - Starting query operation for tab ${tabId}...`, "update");
	let niche = config?.control?.niche || "random";
	const categories = Object.keys(queries);
	if (niche === "random") {
		niche = categories[Math.floor(Math.random() * categories.length)];
	}
	let queryList = queries[niche];
	searchQuery = queryList[Math.floor(Math.random() * queryList.length)];
	const currentYear = new Date().getFullYear();
	searchQuery = searchQuery
		.replace("[year]", currentYear.toString())
		.replace("[country]", config?.runtime?.country);
	
	// Add profile-specific variation to make searches unique per profile
	if (profileId) {
		const profileSuffix = profileId.slice(-4);
		searchQuery = `${searchQuery} ${profileSuffix}`;
	}
	
	searchQuery = addErrors(searchQuery);
	logs && log(`[QUERY] - Search query: ${searchQuery}`, "update");

	try {
		await enableDomains(tabId);
		await delay(shortestDelay, interruptible);
		const isAttached = await isDebuggerAttached(tabId);
		if (!isAttached) {
			await attach(tabId, interruptible);
			await delay(shortestDelay, interruptible);
		}
		const expression = `(function() {
			const input = document.querySelector("#sb_form_q");
			if (input) {
				input.focus();
				input.value = "";
				input.dispatchEvent(new Event("input", { bubbles: true }));
				return true;
			}
			return false;
		})()`;
		await race(
			chrome.debugger.sendCommand({ tabId }, "Runtime.evaluate", {
				expression: expression,
				allowUnsafeEvalBlockedByCSP: true,
				returnByValue: true,
			}),
			shortestDelay,
			`Failed to clear search input for tab ${tabId} within timeout.`,
		);
		await delay(shortestDelay, interruptible);
		for (const char of searchQuery) {
			if (!config?.runtime?.running) {
				logs &&
					log(
						"[QUERY] Interrupted during typing, stopping query.",
						"warning",
					);
				return false;
			}
			await race(
				chrome.debugger.sendCommand({ tabId }, "Input.insertText", {
					text: char,
				}),
				shortestDelay,
				`Failed to insert text for tab ${tabId} within timeout.`,
			);
			await delay(80 + Math.random() * 120, interruptible);
		}
		logs && log(`[QUERY] - Search query typed: ${searchQuery}`, "update");
		await delay(shortestDelay, interruptible);
	} catch (error) {
		log(
			`[QUERY] - Error during query operation: ${error.message}`,
			"error",
		);
	} finally {
		await chrome.tabs.sendMessage(tabId, {
			action: "query",
			query: searchQuery,
		});
		await delay(shortestDelay, interruptible);
		logs && log(`[QUERY] - Search query sent: ${searchQuery}`, "update");
		return true;
	}
}

function addErrors(
	query,
	errorRate = 0.005,
	swapRate = 0.005,
	chancesOfError = 0.1,
) {
	if (Math.random() > chancesOfError) return query;
	const keyboardMap = {
		a: ["s", "q", "w", "z"],
		b: ["v", "g", "h", "n"],
		c: ["x", "d", "f", "v"],
		d: ["s", "e", "r", "f", "c", "x"],
		e: ["w", "s", "d", "r"],
		f: ["d", "r", "t", "g", "v", "c"],
		g: ["f", "t", "y", "h", "b", "v"],
		h: ["g", "y", "u", "j", "n", "b"],
		i: ["u", "j", "k", "o"],
		j: ["h", "u", "i", "k", "m", "n"],
		k: ["j", "i", "o", "l", "m"],
		l: ["k", "o", "p"],
		m: ["n", "j", "k"],
		n: ["b", "h", "j", "m"],
		o: ["i", "k", "l", "p"],
		p: ["o", "l"],
		q: ["a", "w"],
		r: ["e", "d", "f", "t"],
		s: ["a", "w", "e", "d", "x", "z"],
		t: ["r", "f", "g", "y"],
		u: ["y", "h", "j", "i"],
		v: ["c", "f", "g", "b"],
		w: ["q", "a", "s", "e"],
		x: ["z", "s", "d", "c"],
		y: ["t", "g", "h", "u"],
		z: ["a", "s", "x"],
	};
	const getNearbyChar = (char) => {
		const lower = char.toLowerCase();
		const neighbors = keyboardMap[lower];
		if (!neighbors || neighbors.length === 0) return char;
		const swap = neighbors[Math.floor(Math.random() * neighbors.length)];
		return char === lower ? swap : swap.toUpperCase();
	};
	let result = "";
	let errorCount = 0;
	for (let i = 0; i < query.length; i++) {
		let char = query[i];
		// Skip chance (omit a character)
		if (
			Math.random() < errorRate &&
			errorCount < 2 &&
			/[a-zA-Z]/.test(char)
		) {
			errorCount++;
			continue;
		}
		// Duplicate chance
		if (
			Math.random() < errorRate &&
			errorCount < 2 &&
			/[a-zA-Z]/.test(char)
		) {
			result += char;
			errorCount++;
		}
		// Swap with nearby key
		if (
			Math.random() < swapRate &&
			errorCount < 2 &&
			/[a-zA-Z]/.test(char)
		) {
			result += getNearbyChar(char);
			errorCount++;
		} else {
			result += char;
		}
	}
	return result;
}

async function perform(interruptible = true) {
	if (interruptible && !config?.runtime?.running) {
		logs &&
			log(
				"[PERFORM] Interrupted, skipping perform operation.",
				"warning",
			);
		return false;
	}
	const tabId = Number(config?.runtime?.rsaTab);
	if (!tabId) {
		logs &&
			log(
				"[PERFORM] No RSA tab found, skipping perform operation.",
				"warning",
			);
		return false;
	}
	const originalUrl = await getTabUrl(tabId);
	logs && log("[PERFORM] Starting perform operation...", "update");
	try {
		await enableDomains(tabId);
		await delay(shortestDelay, interruptible);
		await chrome.tabs.sendMessage(tabId, {
			action: "perform",
			query: searchQuery,
		});
		logs && log(`[PERFORM] - Search query sent: ${searchQuery}`, "update");
		await wait(tabId);
		await delay(shortestDelay, interruptible);
		const newUrl = await getTabUrl(tabId);
		if (newUrl && newUrl !== originalUrl) {
			logs &&
				log(
					`[PERFORM] - Search performed. URL changed from ${originalUrl} to ${newUrl}`,
					"success",
				);
			return true;
		} else {
			logs &&
				log(
					`[PERFORM] - Search failed and URL did not change: ${originalUrl}`,
					"error",
				);
			return false;
		}
	} catch (error) {
		log(
			`[PERFORM] - Error during perform operation: ${error.message}`,
			"error",
		);
		return false;
	}
}

async function search(searches, min, max, interruptible = true) {
	if (interruptible && !config?.runtime?.running) {
		logs &&
			log("[SEARCH] Interrupted, skipping search operation.", "warning");
		return false;
	}
	if (!navigator.onLine) {
		logs &&
			log(
				"[SEARCH] No internet connection, skipping search operation.",
				"warning",
			);
		return false;
	}
	if (!searches) {
		logs &&
			log(
				"[SEARCH] No searches provided, skipping search operation.",
				"warning",
			);
		return false;
	}
	logs && log("[SEARCH] Starting search operation...", "update");
	const tabId = Number(config?.runtime?.rsaTab);
	const originalUrl = await getTabUrl(tabId);
	const clearIt = config?.control?.clear;

	if (clearIt) await clear();
	await delay(shortestDelay, interruptible);
	if (originalUrl && originalUrl !== bing) {
		await chrome.tabs.update(tabId, {
			url: bing,
		});
		await wait(tabId);
		await delay(shortestDelay, interruptible);
		logs && log(`[SEARCH] Tab updated to Bing URL: ${bing}`, "update");
	}

	// Ensure login before starting searches
	await ensureLogin(tabId, interruptible);
	await delay(shortestDelay, interruptible);

	for (let i = 0; i < searches; i++) {
		if (interruptible && !config?.runtime?.running) {
			logs &&
				log(
					"[SEARCH] Interrupted, skipping search operation.",
					"warning",
				);
			return false;
		}
		if (!navigator.onLine) {
			logs &&
				log(
					"[SEARCH] No internet connection, skipping search operation.",
					"warning",
				);
			return false;
		}
		if (needPatch && clearIt && config?.runtime?.mobile) {
			logs &&
				log(
					"[SEARCH] Need patch, clearing browsing data...",
					"warning",
				);
			await clear();
			await delay(shortestDelay, interruptible);
			await click(interruptible);
			await delay(shortestDelay, interruptible);
		}
		
		// Add more randomization to delays
		const baseDelay = Math.floor(Math.random() * (max * 1000 - min * 1000 + 1)) + min * 1000;
		const profileVariation = profileId ? parseInt(profileId.slice(-2), 16) % 1000 : 0;
		const randomDelay = baseDelay + profileVariation;
		
		if (clearIt && i < 3) {
			await chrome.tabs.update(tabId, {
				active: true,
			});
			await delay(shortestDelay, interruptible);
			await click(interruptible);
			await delay(shortestDelay, interruptible);
		}
		const queried = await query(interruptible);
		if (!queried) {
			logs && log(`[SEARCH] Query failed for ${searchQuery}.`, "error");
		}
		await delay(randomDelay, interruptible);
		const stored = await get();
		if (stored) {
			Object.assign(config, stored);
		}
		const searched = await perform(interruptible);
		if (!searched) {
			await chrome.tabs.update(tabId, {
				url: bing,
				active: true,
			});
			await wait(tabId);
			config.runtime.failed++;
			logs &&
				log(
					`[SEARCH] Search ${
						i + 1
					} failed with query: ${searchQuery}.`,
					"error",
				);
		} else {
			config.runtime.done++;
			logs &&
				log(
					`[SEARCH] Search ${
						i + 1
					} performed with query: ${searchQuery}.`,
					"success",
				);
		}
		await set(config);
		await chrome.action.setBadgeText({
			text:
				Math.round(
					((config.runtime.done + config.runtime.failed) /
						config.runtime.total) *
						100,
				) + "%",
		});
		if (i === searches - 1) {
			logs && log("[SEARCH] Waiting for final delay...", "update");
			await delay(randomDelay, interruptible);
		} else {
			logs && log("[SEARCH] Waiting for longer delay...", "update");
			await delay(mediumDelay + profileVariation, interruptible);
		}
	}
	await chrome.tabs.update(tabId, {
		url: loading + "complete",
	});
	await wait(tabId);
	return true;
}

async function activity(tabId, interruptible = true) {
	if (interruptible && !config?.runtime?.running) {
		logs &&
			log(
				`[ACTIVITY] Interrupted, skipping activity for tab ${tabId}.`,
				"warning",
			);
		return false;
	}
	if (!navigator.onLine) {
		logs &&
			log(
				`[ACTIVITY] No internet connection, skipping activity for tab ${tabId}.`,
				"warning",
			);
		return false;
	}
	tabId = Number(tabId);
	if (!tabId) {
		logs &&
			log(`[ACTIVITY] No tab ID provided, skipping activity.`, "warning");
		return false;
	}

	await attach(tabId, interruptible);
	config.runtime.act = 1;
	await set(config);
	logs && log(`[ACTIVITY] - Attached debugger to tab ${tabId}.`, "update");
	while (true) {
		if (interruptible && !config?.runtime?.running) {
			logs &&
				log(
					`[ACTIVITY] Interrupted, stopping activity for tab ${tabId}.`,
					"warning",
				);
			config.runtime.act = 0;
			await set(config);
			return false;
		}
		if (!navigator.onLine) {
			logs &&
				log(
					`[ACTIVITY] No internet connection, stopping activity for tab ${tabId}.`,
					"warning",
				);
			config.runtime.act = 0;
			await set(config);
			return false;
		}
		await chrome.action.setBadgeText({ text: "👀" });
		await chrome.action.setBadgeBackgroundColor({ color: "#0072FF" });
		await chrome.tabs.update(tabId, {
			url: rewards,
			active: true,
		});
		await wait(tabId);
		await delay(shortestDelay, interruptible);
		await enableDomains(tabId);
		await delay(shortestDelay, interruptible);

		const {
			root: { nodeId: docNodeId },
		} = await race(
			chrome.debugger.sendCommand({ tabId }, "DOM.getDocument"),
			shortestDelay,
		);

		await chrome.tabs.sendMessage(tabId, {
			action: "closePopups",
		});
		await delay(shortestDelay, interruptible);

		const { nodeIds: cardNodes } = await race(
			chrome.debugger.sendCommand({ tabId }, "DOM.querySelectorAll", {
				nodeId: docNodeId,
				selector: ".c-card-content",
			}),
			shortestDelay,
		);
		let clicked = false;
		for (const nodeId of cardNodes) {
			const { nodeId: addIcon } = await race(
				chrome.debugger.sendCommand({ tabId }, "DOM.querySelector", {
					nodeId,
					selector: ".mee-icon-AddMedium",
				}),
				shortestDelay,
			);
			if (!addIcon) continue;
			await chrome.action.setBadgeText({ text: "😄" });
			await race(
				chrome.debugger.sendCommand(
					{ tabId },
					"DOM.scrollIntoViewIfNeeded",
					{
						nodeId,
					},
				),
				shortestDelay,
				`Failed to scroll into view for node ID ${nodeId} in tab ${tabId} within timeout.`,
			);
			await delay(shortestDelay, interruptible);
			const { model } = await race(
				chrome.debugger.sendCommand({ tabId }, "DOM.getBoxModel", {
					nodeId,
				}),
				shortestDelay,
			);
			const quad = model?.content;
			const x = (quad[0] + quad[2]) / 2;
			const y = (quad[1] + quad[5]) / 2;
			logs &&
				log(
					`[ACTIVITY] - Clicking on node ID ${nodeId} in tab ${tabId}.`,
					"update",
				);
			const existingTabs = await chrome.tabs.query({});
			await delay(shortestDelay, interruptible);
			await race(
				chrome.debugger.sendCommand(
					{ tabId },
					"Input.dispatchMouseEvent",
					{
						type: "mousePressed",
						button: "left",
						x,
						y,
						clickCount: 1,
					},
				),
				shortestDelay,
				`Failed to click on node ID ${nodeId} in tab ${tabId} within timeout.`,
			);
			await delay(80 + Math.random() * 120, interruptible);
			await race(
				chrome.debugger.sendCommand(
					{ tabId },
					"Input.dispatchMouseEvent",
					{
						type: "mouseReleased",
						button: "left",
						x,
						y,
						clickCount: 1,
					},
				),
				shortestDelay,
				`Failed to release mouse on node ID ${nodeId} in tab ${tabId} within timeout.`,
			);
			clicked = true;
			await delay(5000 + Math.random() * 5000);
			const newTabs = await chrome.tabs.query({});
			const newTab = newTabs.find(
				(t) => !existingTabs.find((e) => e.id === t.id),
			);
			if (newTab) {
				await chrome.tabs.remove(newTab.id);
				logs &&
					log(
						`[ACTIVITY] - New tab opened and closed: ${newTab.id}.`,
						"success",
					);
			}
			break;
		}
		if (!clicked) {
			logs &&
				log(
					`[ACTIVITY] - No more rewards found in tab ${tabId}.`,
					"success",
				);
			config.runtime.act = 0;
			await set(config);
			return true;
		}
	}
}

async function initialise(searches) {
	await initializeProfile(); // Initialize profile isolation
	await resetRuntime(config); // reset runtime state of last search session
	if (!navigator.onLine) {
		logs &&
			log(
				"[INITIALISE] No internet connection, skipping initialisation.",
				"warning",
			);
		return false;
	}
	if (searches.desk === 0 && searches.mob === 0) {
		logs &&
			log(
				"[INITIALISE] No searches to perform, skipping initialisation.",
				"warning",
			);
		return false;
	}
	let tabId = null;
	try {
		const rsaTab = await chrome.tabs.create({
			url: bing,
			active: true,
		});
		tabId = Number(rsaTab.id);
		config.runtime.rsaTab = tabId;
		config.runtime.total = searches.desk + searches.mob;
		config.runtime.running = 1;
		await wait(tabId);
		await delay(shortestDelay, true);
		logs &&
			log(`[INITIALISE] - Created new tab with ID: ${tabId}`, "update");
		await chrome.tabs.update(tabId, {
			autoDiscardable: false,
		});
		await set(config);
		logs &&
			log(
				`[INITIALISE] - Config updated with rsaTab: ${tabId}`,
				"update",
			);
		await attach(tabId);
		await delay(shortestDelay, true);
		await chrome.alarms.clear("schedule");
		logs && log(`[INITIALISE] - Cleared any existing alarms.`, "update");
		await chrome.action.setBadgeText({ text: "0%" });
		await chrome.action.setBadgeTextColor({ color: "#FFFFFF" });
		await chrome.action.setBadgeBackgroundColor({ color: "#0072FF" });

		if (searches.desk > 0 && config?.runtime?.running) {
			logs &&
				log(`[INITIALISE] - Starting desktop searches...`, "update");
			await search(searches.desk, searches.min, searches.max);
			logs &&
				log(`[INITIALISE] - Desktop searches completed.`, "success");
		}
		if (searches.mob > 0 && config?.runtime?.running) {
			config.runtime.mobile = 1;
			await set(config);
			await simulate(tabId);
			logs &&
				log(
					`[INITIALISE] - Simulating mobile environment...`,
					"update",
				);
			await delay(shortestDelay, true);
			await search(searches.mob, searches.min, searches.max);
			logs && log(`[INITIALISE] - Mobile searches completed.`, "success");
			config.runtime.mobile = 0;
			await set(config);
		}
		await detach(tabId);
		await delay(shortestDelay);
		if (config?.control?.clear) {
			await attach(tabId);
			await delay(shortestDelay, true);
			await chrome.tabs.update(tabId, {
				url: bing,
				active: true,
			});
			await wait(tabId);
			await delay(shortestDelay, true);
			await clear();
			await delay(shortestDelay, true);
			await click();
			await delay(shortestDelay, true);
			await detach(tabId);
			logs &&
				log(
					`[INITIALISE] - Browsing data cleared after searches.`,
					"success",
				);
		}
		if (
			config?.runtime?.running &&
			config?.control?.act
		) {
			logs &&
				log(
					`[INITIALISE] - Activity started for tab ${tabId}.`,
					"update",
				);
			await activity(tabId);
			logs &&
				log(
					`[INITIALISE] - Activity completed for tab ${tabId}.`,
					"success",
				);
		}
	} catch (error) {
		log(
			`[INITIALISE] - Error during initialisation: ${error.message}`,
			"error",
		);
	} finally {
		await chrome.action.setBadgeText({ text: "" });
		const tabs = await chrome.tabs.query({});
		if (tabs.length < 2) {
			await chrome.tabs.create({
				url: rewards,
				active: true,
			});
			logs &&
				log(`[INITIALISE] - New tab created for rewards.`, "update");
		}
		try {
			await chrome.tabs.remove(tabId);
		} catch (error) {
			log(
				`[INITIALISE] - Error closing RSA tab: ${error.message} - Already closed?`,
				"error",
			);
		}
		logs &&
			log(`[INITIALISE] - Closed RSA tab with ID: ${tabId}`, "update");
		config.runtime.rsaTab = null;
		config.runtime.running = 0;
		await set(config); // instead of resetRuntime(config); to keep the last search state visible in popup
		// Remove Pro requirement for scheduling
		const modes = {
			m3: { min: 300, range: 150 },
			m4: { min: 900, range: 150 },
		};
		const mode = modes[config?.schedule?.mode];
		if (mode) {
			const randomDelay =
				Math.floor(Math.random() * mode.range) + mode.min;
			const alarmTime = Date.now() + randomDelay * 1000;
			await chrome.alarms.create("schedule", { when: alarmTime });
			const formattedTime = new Date(alarmTime).toLocaleTimeString();
			logs &&
				log(
					`[INITIALISE] - Scheduled next run for ${formattedTime}.`,
					"update",
				);
		}
	}
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
	if (alarm.name === "schedule") {
		const stored = await get();
		if (stored) {
			Object.assign(config, stored);
		}
		logs && log(`[ALARM] - Alarm triggered.`, "update");
		if (
			config?.control?.consent &&
			!["m1", "m2"].includes(config?.schedule?.mode) &&
			(config?.schedule?.desk !== 0 || config?.schedule?.mob !== 0)
		) {
			logs && log(`[ALARM] - Starting scheduled searches.`, "update");
			await initialise(config?.schedule);
		}
	}
});

chrome.runtime.onInstalled.addListener(async (details) => {
	if (details.reason === "install") {
		log(`[INSTALL] - Extension installed.`, "update");
		await chrome.tabs.create({
			url: tnc,
			active: true,
		});
		await setUserGeo();
	}
	if (details.reason === "update") {
		log(
			`[UPDATE] - Extension updated to version ${
				chrome.runtime.getManifest().version
			}.`,
			"update",
		);
		await chrome.tabs.create({
			url: tnc,
			active: true,
		});
		const stored = await get();
		if (stored) {
			Object.assign(config, stored);
		}
		await setUserGeo();
		if (config?.control?.consent) {
			await reverify();
		}
		config.runtime.act = 0;
		config.runtime.running = 0;
		await set(config);
	}
});

chrome.runtime.onStartup.addListener(async () => {
	const stored = await get();
	if (stored) {
		Object.assign(config, stored);
	}
	log(`[STARTUP] - Extension started.`, "success");
	if (config?.control?.consent) {
		await reverify();
	}
	const storedUpdated = await get();
	if (storedUpdated) {
		Object.assign(config, storedUpdated);
	}
	if (
		config?.control?.consent &&
		config?.schedule?.mode !== "m1" &&
		(config?.schedule?.desk !== 0 || config?.schedule?.mob !== 0)
	) {
		await delay(longestDelay, false);
		await initialise(config?.schedule);
	}
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	(async () => {
		const stored = await get();
		if (stored) {
			Object.assign(config, stored);
		}
		log(`Message received: ${message.action}`);

		if (!config?.control?.consent) {
			log("Consent not given. Ignoring message.", "error");
			sendResponse({ success: false, message: "Consent not given." });
			return;
		}

		switch (message.action) {
			case "start":
				if (config?.search?.desk === 0 && config?.search?.mob === 0) {
					log("No searches to perform.", "error");
					sendResponse({
						success: false,
						message: "No searches to perform.",
					});
					return;
				}
				log(
					`Starting searches: ${config?.search?.desk} desktop and ${config?.search?.mob} mobile.`,
				);
				sendResponse({ success: true, message: "Starting searches." });
				await initialise(config?.search);
				break;

			case "schedule":
				// Remove Pro key requirement
				if (
					config?.schedule?.desk === 0 &&
					config?.schedule?.mob === 0
				) {
					log("No searches to perform.", "error");
					sendResponse({
						success: false,
						message: "No searches to perform.",
					});
					return;
				}
				log(
					`Starting scheduled searches: ${config?.schedule?.desk} desktop and ${config?.schedule?.mob} mobile.`,
				);
				sendResponse({
					success: true,
					message: "Starting scheduled searches.",
				});
				await initialise(config?.schedule);
				break;

			case "stop":
				log("Stopping searches or activities.");
				config.runtime.running = 0;
				await set(config);
				sendResponse({
					success: true,
					message: "Stopping searches or activities.",
				});
				break;

			case "clearBrowsingData":
				// Remove Pro key requirement
				log("Clearing Bing browsing data.");
				await clear();
				sendResponse({
					success: true,
					message: "Clearing Bing browsing data.",
				});
				break;

			case "simulate":
				// Remove Pro key requirement
				log("Toggling mobile device simulation.");
				sendResponse({
					success: true,
					message: "Toggling mobile device simulation.",
				});
				await toggleSimulate();
				break;

			case "activity":
				// Remove Pro key requirement
				log("Starting activity.");
				sendResponse({ success: true, message: "Starting activity." });
				const activityTab = await chrome.tabs.create({
					url: rewards,
					active: true,
				});
				await wait(activityTab.id);
				config.runtime.running = 1;
				await set(config);
				await activity(activityTab.id);
				await chrome.tabs.remove(activityTab.id);
				config.runtime.running = 0;
				await set(config);
				break;

			default:
				log(`Unknown message action: ${message.action}`, "error");
				sendResponse({
					success: false,
					message: "Unknown message action.",
				});
				break;
		}
	})();
	return true; // Keeps sendResponse channel alive for async use
});