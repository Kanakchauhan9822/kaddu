chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
	(async () => {
		try {
			switch (request.action) {
				case "login": {
					const mobile = request.mobile;
					if (mobile) {
						sendResponse({ success: true });
						
						// Enhanced mobile login detection
						const mclick = document.querySelector("#mHamburger, .hamburger, [data-bi-name='hamburger']");
						const mobileMenu = document.querySelector("#HBContent, .mobile-menu");
						
						if (mclick && !mobileMenu) {
							mclick.click();
							await delay(1000);
						}
						
						// Look for sign-in elements with multiple selectors
						const menuLink = document.querySelector(
							"#HBSignIn a[role='menuitem']:not([style*='display: none']), " +
							".signin-link:not([style*='display: none']), " +
							"[data-bi-name='signin']:not([style*='display: none'])"
						);
						
						// Check if already logged in
						const isLoggedIn = document.querySelector(
							"#id_n, .id_button, [data-bi-name='mecontrol'], " +
							".msame_Header_name, .user-info"
						);

						if (!isLoggedIn && menuLink && 
							(menuLink.href.includes("/fd/auth/signin") || 
							 menuLink.href.includes("login.microsoftonline.com"))) {
							await delay(1000);
							menuLink.click();
							console.log("Clicked mobile sign in link");
						} else if (isLoggedIn) {
							console.log("User already logged in on mobile");
						} else {
							console.log("No mobile login link found or user already logged in");
						}
					} else {
						sendResponse({ success: true });
						
						// Enhanced desktop login detection
						const click = document.querySelector(".b_clickarea, #id_s, .id_signin");
						const desktopMenu = document.querySelector("#rewid-f, .desktop-menu");
						
						if (click && !desktopMenu) {
							click.click();
							await delay(1000);
						}
						
						// Check for sign-in button on desktop
						const signInButton = document.querySelector(
							"#id_s, .id_signin, [data-bi-name='signin'], " +
							".signin-button, .sign-in-link"
						);
						
						// Check if already logged in
						const isLoggedIn = document.querySelector(
							"#id_n, .id_button, [data-bi-name='mecontrol'], " +
							".msame_Header_name, .user-info, #id_rh"
						);
						
						if (!isLoggedIn && signInButton) {
							await delay(500);
							signInButton.click();
							console.log("Clicked desktop sign in button");
						} else if (isLoggedIn) {
							console.log("User already logged in on desktop");
						} else {
							console.log("No desktop sign-in button found or user already logged in");
						}
					}
					break;
				}

				case "query": {
					const input = document.querySelector("#sb_form_q");
					if (input && input.value !== request.query) {
						sendResponse({ success: true });
						input.value = "";
						input.focus();
						
						// Add more realistic typing with variable delays
						for (const char of request.query) {
							input.value += char;
							input.dispatchEvent(new Event("input", { bubbles: true }));
							await delay(
								50 + Math.floor(Math.random() * 100), // Increased base delay
								true,
							);
						}
						
						// Trigger additional events for better compatibility
						input.dispatchEvent(new Event("change", { bubbles: true }));
						input.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true }));
						
						// Wait a bit more after typing
						await delay(500 + Math.random() * 500);
					} else {
						sendResponse({ success: true });
					}
					break;
				}

				case "perform": {
					const input = document.querySelector("#sb_form_q");

					if (!input) {
						sendResponse({
							success: false,
							message: "Input not found",
						});
						return;
					}

					input.value = request.query;
					input.focus();
					input.dispatchEvent(new Event("input", { bubbles: true }));
					input.dispatchEvent(new Event("change", { bubbles: true }));

					// Try multiple methods to submit the search
					const form = input.closest("form");
					const submitButton = document.querySelector(
						"#sb_form_go, .b_searchbox_submit, [type='submit']"
					);
					
					if (form) {
						// Increased delay before submission
						await delay(1000 + Math.random() * 1000);
						
						// Try clicking submit button first
						if (submitButton && submitButton.offsetParent !== null) {
							submitButton.click();
							console.log("Clicked submit button");
						} else {
							// Fallback to form submission
							form.submit();
							console.log("Submitted form");
						}
						
						// Alternative: simulate Enter key press
						input.dispatchEvent(new KeyboardEvent("keydown", {
							key: "Enter",
							code: "Enter",
							keyCode: 13,
							bubbles: true
						}));
						
						sendResponse({ success: true });
					} else {
						sendResponse({
							success: false,
							message: "Form not found",
						});
					}
					break;
				}

				case "waitForPageLoad": {
					// Wait for page to fully load and stabilize
					await waitForPageStabilization();
					sendResponse({ success: true });
					break;
				}

				case "checkSearchCounted": {
					// Check if the search was counted by looking for point indicators
					const pointsIndicator = await checkForPointsAwarded();
					sendResponse({ 
						success: true, 
						counted: pointsIndicator.counted,
						points: pointsIndicator.points 
					});
					break;
				}

				case "closePopups": {
					// Enhanced popup closing with multiple selectors
					const popupSelectors = [
						".dashboardPopUpPopUpCloseButton",
						".popup-close",
						".modal-close",
						"[data-bi-name='close']",
						".close-button",
						".dismiss-button"
					];
					
					let closed = false;
					for (const selector of popupSelectors) {
						const closeButton = document.querySelector(selector);
						if (closeButton && closeButton.offsetParent !== null) {
							closeButton.click();
							closed = true;
							console.log(`Closed popup with selector: ${selector}`);
							break;
						}
					}
					
					if (!closed) {
						console.log("No popup close button found");
					}
					
					sendResponse({ success: true });
					break;
				}

				default:
					console.warn(
						"Unknown content script action:",
						request.action,
					);
					sendResponse({
						success: false,
						message: "Unknown action.",
					});
					return;
			}
		} catch (err) {
			console.error("Content script action failed:", err);
			sendResponse({ success: false, message: err.message });
		}
	})();
	return true; // Keeps sendResponse alive for async
});

async function delay(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

// Wait for page to be fully loaded and stable
async function waitForPageStabilization() {
	// Wait for document ready state
	if (document.readyState !== 'complete') {
		await new Promise(resolve => {
			const checkReady = () => {
				if (document.readyState === 'complete') {
					resolve();
				} else {
					setTimeout(checkReady, 100);
				}
			};
			checkReady();
		});
	}

	// Wait for search results to load
	let attempts = 0;
	const maxAttempts = 30; // 3 seconds max wait
	
	while (attempts < maxAttempts) {
		const searchResults = document.querySelector('#b_results, .b_algo, .b_searchboxForm');
		if (searchResults) {
			// Additional wait to ensure content is stable
			await delay(500);
			break;
		}
		await delay(100);
		attempts++;
	}

	// Wait for any animations or dynamic content to settle
	await delay(1000 + Math.random() * 1000);
}

// Check if search was counted and points were awarded
async function checkForPointsAwarded() {
	const result = { counted: false, points: 0 };
	
	try {
		// Look for Microsoft Rewards point indicators
		const pointSelectors = [
			'[data-bi-name="rewardsPoints"]',
			'.rewards-points',
			'#id_rc',
			'.b_searchboxForm .rewards',
			'[aria-label*="points"]',
			'[title*="points"]'
		];

		for (const selector of pointSelectors) {
			const element = document.querySelector(selector);
			if (element) {
				const text = element.textContent || element.getAttribute('aria-label') || element.getAttribute('title') || '';
				const pointMatch = text.match(/(\d+)\s*point/i);
				if (pointMatch) {
					result.counted = true;
					result.points = parseInt(pointMatch[1]);
					console.log(`Points detected: ${result.points}`);
					break;
				}
			}
		}

		// Alternative check: Look for search completion indicators
		if (!result.counted) {
			const completionIndicators = [
				'.b_results',
				'#b_results',
				'.b_algo',
				'.b_searchboxForm'
			];

			for (const selector of completionIndicators) {
				if (document.querySelector(selector)) {
					result.counted = true;
					console.log('Search completion detected via results presence');
					break;
				}
			}
		}

		// Check for rewards dashboard elements
		if (!result.counted) {
			const rewardsElements = document.querySelectorAll('[data-bi-name*="reward"], [class*="reward"]');
			if (rewardsElements.length > 0) {
				result.counted = true;
				console.log('Rewards elements detected');
			}
		}

	} catch (error) {
		console.error('Error checking for points:', error);
	}

	return result;
}

// Monitor for point changes
function monitorPointChanges() {
	const observer = new MutationObserver((mutations) => {
		mutations.forEach((mutation) => {
			if (mutation.type === 'childList' || mutation.type === 'characterData') {
				const target = mutation.target;
				if (target.textContent && target.textContent.includes('point')) {
					console.log('Point change detected:', target.textContent);
				}
			}
		});
	});

	// Observe the entire document for point-related changes
	observer.observe(document.body, {
		childList: true,
		subtree: true,
		characterData: true
	});

	// Stop observing after 10 seconds
	setTimeout(() => observer.disconnect(), 10000);
}

// Start monitoring when page loads
if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', monitorPointChanges);
} else {
	monitorPointChanges();
}