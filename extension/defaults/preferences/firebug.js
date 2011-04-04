// Global
pref("extensions.firebug.architecture", "inProcess");

pref("javascript.options.strict.debug", false);
pref("extensions.firebug.defaultPanelName", "html");
pref("extensions.firebug.throttleMessages", true);
pref("extensions.firebug.textSize", 0);
pref("extensions.firebug.showInfoTips", true);
pref("extensions.firebug.textWrapWidth", 100);
pref("extensions.firebug.openInWindow", false);
pref("extensions.firebug.previousPlacement", 0);
pref("extensions.firebug.showErrorCount", true);
pref("extensions.firebug.viewPanelOrient", false);          // true == vertical, false == horizontal
pref("extensions.firebug.allPagesActivation", "none");
pref("extensions.firebug.hiddenPanels", "");                // List of hidden panels separated by a space
pref("extensions.firebug.panelTabMinWidth", 50);            // Minimum width of a panel tab [px] applied when there is no enough horizontal size for the tab bar.
pref("extensions.firebug.sourceLinkLabelWidth", 17);        // Maximum amount of characters for source link labels (displayed e.g. in CSS or Console panels)
pref("extensions.firebug.currentVersion", "");              // If Firebug version is bigger than the one in this string, a first-run welcome page is displayed.
pref("extensions.firebug.useDefaultLocale", false);         // Set to true if Firebug should use default (en-US) locale instead of the current Firefox locale.
pref("extensions.firebug.activateSameOrigin", true);
pref("extensions.firebug.toolbarCustomizationDone", false);  // Set to true if the start-button has been initially appended into Firefox toolbar.
pref("extensions.firebug.addonBarOpened", false);            // Set to true if Firefox addon-bar has been initially opened for the user (to see the status bar icon at least the first time).
pref("extensions.firebug.showBreakNotification", true);      // If true, Firebug shows a notification message when break in debugger happens (break on debugger; keyword, break on an error, etc.)

// Command line
pref("extensions.firebug.largeCommandLine", false);

// Search
pref("extensions.firebug.searchCaseSensitive", false);
pref("extensions.firebug.searchGlobal", true);
pref("extensions.firebug.searchUseRegularExpression", false);

pref("extensions.firebug.netSearchHeaders", false);
pref("extensions.firebug.netSearchParameters", false);
pref("extensions.firebug.netSearchResponseBody", false);

// Console
pref("extensions.firebug.showJSErrors", true);
pref("extensions.firebug.showJSWarnings", false);
pref("extensions.firebug.showCSSErrors", false);
pref("extensions.firebug.showXMLErrors", false);
pref("extensions.firebug.showChromeErrors", false);
pref("extensions.firebug.showChromeMessages", false);
pref("extensions.firebug.showExternalErrors", false);
pref("extensions.firebug.showNetworkErrors", false);
pref("extensions.firebug.showXMLHttpRequests", true);
pref("extensions.firebug.showStackTrace", false);
pref("extensions.firebug.console.logLimit", 500);
pref("extensions.firebug.console.enableSites", false);
pref("extensions.firebug.tabularLogMaxHeight", 200);      // Max height [px] for tabular output in console (provided e.g. by console.table() method). Set to zero in case of no limit.
pref("extensions.firebug.consoleFilterTypes", "all");

// HTML
pref("extensions.firebug.showCommentNodes", false);
pref("extensions.firebug.showTextNodesWithWhitespace", false);
pref("extensions.firebug.showTextNodesWithEntities", true);
pref("extensions.firebug.showFullTextNodes", true);
pref("extensions.firebug.highlightMutations", true);
pref("extensions.firebug.expandMutations", false);
pref("extensions.firebug.scrollToMutations", false);
pref("extensions.firebug.shadeBoxModel", true);
pref("extensions.firebug.showQuickInfoBox", false);
pref("extensions.firebug.displayedAttributeValueLimit", 1024); // Maximum characteres used to displaye value of an (HTML) attribute. There is no limit if set to 0.

// CSS
pref("extensions.firebug.onlyShowAppliedStyles", false);
pref("extensions.firebug.showUserAgentCSS", false);
pref("extensions.firebug.expandShorthandProps", false);
pref("extensions.firebug.showMozillaSpecificStyles", false);
pref("extensions.firebug.computedStylesDisplay", "grouped");
pref("extensions.firebug.cssEditMode", "Source");     // 'Source' == Source editing, 'Live' == Live editing

// Script
pref("extensions.firebug.breakOnErrors", false);
pref("extensions.firebug.showAllSourceFiles", false);
pref("extensions.firebug.trackThrowCatch", false);
pref("extensions.firebug.script.enableSites", false);
pref("extensions.firebug.scriptsFilter", "all");

// If the value is greather than zero, the Script panel replaces tabs
// by corresponding number of spaces when displaying JavaScript source.
pref("extensions.firebug.replaceTabs", 4);
pref("extensions.firebug.filterSystemURLs", true);

// Stack
pref("extensions.firebug.omitObjectPathStack", false);

// DOM
pref("extensions.firebug.showUserProps", true);
pref("extensions.firebug.showUserFuncs", true);
pref("extensions.firebug.showDOMProps", true);
pref("extensions.firebug.showDOMFuncs", false);
pref("extensions.firebug.showDOMConstants", false);
pref("extensions.firebug.ObjectShortIteratorMax", 3);

// Layout
pref("extensions.firebug.showRulers", true);

// Net
pref("extensions.firebug.netFilterCategory", "all");
pref("extensions.firebug.net.logLimit", 500);
pref("extensions.firebug.net.enableSites", false);
pref("extensions.firebug.netDisplayedResponseLimit", 102400); // Maximum size limit for displayed responses [net, console panels].
pref("extensions.firebug.netDisplayedPostBodyLimit", 10240); // Maximum size limit for displayed post data source [net, console panels].
pref("extensions.firebug.net.hiddenColumns", "");   // List of hidden columns for the Net panel (space separated)
pref("extensions.firebug.netPhaseInterval", 1000);    // Specifies an interval (ms) after which a new phase (session) in the timeline graph is started. Set to 0 to not start new phase at all.
pref("extensions.firebug.sizePrecision", 1);       // Number of displayed decimal places for size info in the UI. Allowed values: [-1 (all in bytes), 0 (no decimal places), 1 (one decimal place), 2 (two decimal places)]
pref("extensions.firebug.netParamNameLimit", 25);       // Maximum size [characters] of displayed parameter names in the Net panel (post tab). No limit if zero or less.
pref("extensions.firebug.netShowPaintEvents", false);
pref("extensions.firebug.netShowBFCacheResponses", true);   // Show responses coming from the BF (back-forward) cache. These doesn't represent any network activity.
pref("extensions.firebug.netHtmlPreviewHeight", 100);       // Default height of a preview for net HTML responses.

// JSON Preview
pref("extensions.firebug.sortJsonPreview", false);   // If true JSON preview in the Net panel is sorted by keys.

// Cache
pref("extensions.firebug.cache.mimeTypes", ""); // list of additional cached mime-types separated by space.
pref("extensions.firebug.cache.responseLimit", 5242880); // maximum size limit for cached response.

// External Editors
pref("extensions.firebug.externalEditors", "");

// Keyboard
pref("extensions.firebug.key.shortcut.reenterCommand", "control shift e");
pref("extensions.firebug.key.shortcut.toggleInspecting", "accel shift c");
pref("extensions.firebug.key.shortcut.toggleQuickInfoBox", "accel shift i");
pref("extensions.firebug.key.shortcut.toggleProfiling", "accel shift p");
pref("extensions.firebug.key.shortcut.focusCommandLine", "accel shift l");
pref("extensions.firebug.key.shortcut.focusFirebugSearch", "accel shift k");
pref("extensions.firebug.key.shortcut.focusWatchEditor", "accel shift n");
pref("extensions.firebug.key.shortcut.focusLocation", "control shift VK_SPACE");
pref("extensions.firebug.key.shortcut.nextObject", "control .");
pref("extensions.firebug.key.shortcut.previousObject", "control ,");
pref("extensions.firebug.key.shortcut.toggleFirebug", "VK_F12");
pref("extensions.firebug.key.shortcut.detachFirebug", "accel VK_F12");
pref("extensions.firebug.key.shortcut.leftFirebugTab", "accel shift VK_PAGE_UP");
pref("extensions.firebug.key.shortcut.rightFirebugTab", "accel shift VK_PAGE_DOWN");
pref("extensions.firebug.key.shortcut.previousFirebugTab", "control `");
pref("extensions.firebug.key.shortcut.clearConsole", "accel shift r");
pref("extensions.firebug.key.shortcut.navBack", "accel shift VK_LEFT");
pref("extensions.firebug.key.shortcut.navForward", "accel shift VK_RIGHT");
pref("extensions.firebug.key.shortcut.increaseTextSize", "accel shift +");
pref("extensions.firebug.key.shortcut.decreaseTextSize", "accel shift -");
pref("extensions.firebug.key.shortcut.normalTextSize", "accel VK_INSERT");

// Accessibility
pref("extensions.firebug.a11y.enable", false);

// Debugging
pref("extensions.firebug.clearDomplate", false);
