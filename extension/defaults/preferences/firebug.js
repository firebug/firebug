// For a detailed description of all preferences see http://getfirebug.com/wiki/index.php/Firebug_Preferences

// Global
pref("extensions.firebug.defaultModuleList", "");

pref("javascript.options.strict.debug", false);
pref("extensions.firebug.defaultPanelName", "html");
pref("extensions.firebug.throttleMessages", true);
pref("extensions.firebug.textSize", 0);
pref("extensions.firebug.showInfoTips", true);
pref("extensions.firebug.textWrapWidth", 100);
pref("extensions.firebug.framePosition", "bottom");
pref("extensions.firebug.previousPlacement", 0);
pref("extensions.firebug.showErrorCount", true);
pref("extensions.firebug.viewPanelOrient", false);
pref("extensions.firebug.allPagesActivation", "none");
pref("extensions.firebug.hiddenPanels2", "");
pref("extensions.firebug.panelTabMinWidth", 50);
pref("extensions.firebug.sourceLinkLabelWidth", 17);
pref("extensions.firebug.currentVersion", "");
pref("extensions.firebug.showFirstRunPage", true);
pref("extensions.firebug.useDefaultLocale", false);
pref("extensions.firebug.activateSameOrigin", true);
pref("extensions.firebug.toolbarCustomizationDone", false);
pref("extensions.firebug.showBreakNotification", true);
pref("extensions.firebug.stringCropLength", 50);
pref("extensions.firebug.hideDefaultInspector", false);
pref("extensions.firebug.delayLoad", true);
pref("extensions.firebug.clearAnnotationsConfirmation", true);

// Remoting
pref("extensions.firebug.serverHost", "localhost");
pref("extensions.firebug.serverPort", 5999);
pref("extensions.firebug.serverMode", false);

// Command line
pref("extensions.firebug.commandEditor", false);
pref("extensions.firebug.alwaysShowCommandLine", false);
pref("extensions.firebug.debugCommandLineAPI", false);

// Search
pref("extensions.firebug.searchCaseSensitive", false);
pref("extensions.firebug.searchGlobal", true);
pref("extensions.firebug.searchUseRegularExpression", false);

pref("extensions.firebug.netSearchHeaders", false);
pref("extensions.firebug.netSearchParameters", false);
pref("extensions.firebug.netSearchResponseBody", false);

// Persist (default values)
pref("extensions.firebug.console.defaultPersist", false);
pref("extensions.firebug.net.defaultPersist", false);

// Console
pref("extensions.firebug.showJSErrors", true);
pref("extensions.firebug.showJSWarnings", false);
pref("extensions.firebug.showCSSErrors", false);
pref("extensions.firebug.showXMLErrors", false);
pref("extensions.firebug.showChromeErrors", false);
pref("extensions.firebug.showChromeMessages", false);
pref("extensions.firebug.showNetworkErrors", true);
pref("extensions.firebug.showXMLHttpRequests", true);
pref("extensions.firebug.showStackTrace", false);
pref("extensions.firebug.console.logLimit", 500);
pref("extensions.firebug.console.enableSites", false);
pref("extensions.firebug.tabularLogMaxHeight", 200);
pref("extensions.firebug.consoleFilterTypes", "all");
pref("extensions.firebug.preferJSDSourceLinks", false);
pref("extensions.firebug.commandLineShowCompleterPopup", true);
pref("extensions.firebug.console.groupLogMessages", true);
pref("extensions.firebug.consoleCommandHistoryMax", 1000);

// HTML
pref("extensions.firebug.showCommentNodes", false);
pref("extensions.firebug.showTextNodesWithWhitespace", false);
pref("extensions.firebug.entityDisplay", "symbols");
pref("extensions.firebug.showFullTextNodes", true);
pref("extensions.firebug.highlightMutations", true);
pref("extensions.firebug.expandMutations", false);
pref("extensions.firebug.scrollToMutations", false);
pref("extensions.firebug.shadeBoxModel", true);
pref("extensions.firebug.showQuickInfoBox", false);
pref("extensions.firebug.pinQuickInfoBox", false);
pref("extensions.firebug.displayedAttributeValueLimit", 1024);
pref("extensions.firebug.multiHighlightLimit", 250);

// CSS
pref("extensions.firebug.onlyShowAppliedStyles", false);
pref("extensions.firebug.showUserAgentCSS", false);
pref("extensions.firebug.expandShorthandProps", false);
pref("extensions.firebug.cssEditMode", "Source");
pref("extensions.firebug.colorDisplay", "authored");

// Computed
pref("extensions.firebug.computedStylesDisplay", "grouped");
pref("extensions.firebug.showMozillaSpecificStyles", false);

// Script
pref("extensions.firebug.breakOnErrors", false);
pref("extensions.firebug.trackThrowCatch", false);
pref("extensions.firebug.script.enableSites", false);
pref("extensions.firebug.scriptsFilter", "all");
pref("extensions.firebug.replaceTabs", 2);
pref("extensions.firebug.filterSystemURLs", true);
pref("extensions.firebug.maxScriptLineLength", 10000);
pref("extensions.firebug.breakOnExceptions", false);
pref("extensions.firebug.ignoreCaughtExceptions", false);

// Stack
pref("extensions.firebug.omitObjectPathStack", false);
pref("extensions.firebug.showStackFrameArguments", true);

// DOM
pref("extensions.firebug.showUserProps", true);
pref("extensions.firebug.showUserFuncs", true);
pref("extensions.firebug.showDOMProps", true);
pref("extensions.firebug.showDOMFuncs", false);
pref("extensions.firebug.showDOMConstants", false);
pref("extensions.firebug.showInlineEventHandlers", false);
pref("extensions.firebug.showClosures", false);
pref("extensions.firebug.ObjectShortIteratorMax", 3);
pref("extensions.firebug.showEnumerableProperties", true);
pref("extensions.firebug.showOwnProperties", false);

// Layout
pref("extensions.firebug.showRulers", true);

// Net
pref("extensions.firebug.netFilterCategories", "all");
pref("extensions.firebug.net.logLimit", 500);
pref("extensions.firebug.net.enableSites", false);
pref("extensions.firebug.net.curlAddCompressedArgument", false);
pref("extensions.firebug.netDisplayedResponseLimit", 102400);
pref("extensions.firebug.netDisplayedPostBodyLimit", 10240);
pref("extensions.firebug.net.hiddenColumns", "netProtocolCol netLocalAddressCol");
pref("extensions.firebug.netPhaseInterval", 1000);
pref("extensions.firebug.sizePrecision", 1);
pref("extensions.firebug.netParamNameLimit", 25);
pref("extensions.firebug.netShowPaintEvents", false);
pref("extensions.firebug.netShowBFCacheResponses", false);
pref("extensions.firebug.netHtmlPreviewHeight", 100);
pref("extensions.firebug.netResponseHeadersVisible", true);
pref("extensions.firebug.netRequestHeadersVisible", true);
pref("extensions.firebug.netCachedHeadersVisible", false);
pref("extensions.firebug.netPostRequestHeadersVisible", false);
pref("extensions.firebug.netSortPostParameters", true);

// JSON Preview
pref("extensions.firebug.sortJsonPreview", false);

// Cache
pref("extensions.firebug.cache.mimeTypes", "");
pref("extensions.firebug.cache.responseLimit", 5242880);

// External Editors
pref("extensions.firebug.externalEditors", "");

// Keyboard
pref("extensions.firebug.key.shortcut.reenterCommand", "accel shift e");
pref("extensions.firebug.key.shortcut.toggleInspecting", "accel shift c");
pref("extensions.firebug.key.shortcut.toggleQuickInfoBox", "accel shift i");
pref("extensions.firebug.key.shortcut.toggleProfiling", "accel shift p");
pref("extensions.firebug.key.shortcut.focusCommandLine", "accel shift l");
pref("extensions.firebug.key.shortcut.focusFirebugSearch", "accel f");
pref("extensions.firebug.key.shortcut.focusWatchEditor", "accel shift n");
pref("extensions.firebug.key.shortcut.focusLocation", "accel shift VK_SPACE");
pref("extensions.firebug.key.shortcut.nextObject", "accel .");
pref("extensions.firebug.key.shortcut.previousObject", "accel ,");
pref("extensions.firebug.key.shortcut.toggleFirebug", "VK_F12");
pref("extensions.firebug.key.shortcut.closeFirebug", "shift VK_F12");
pref("extensions.firebug.key.shortcut.detachFirebug", "accel VK_F12");
pref("extensions.firebug.key.shortcut.leftFirebugTab", "accel shift VK_PAGE_UP");
pref("extensions.firebug.key.shortcut.rightFirebugTab", "accel shift VK_PAGE_DOWN");
pref("extensions.firebug.key.shortcut.previousFirebugTab", "accel `");
pref("extensions.firebug.key.shortcut.clearConsole", "alt r");
pref("extensions.firebug.key.shortcut.navBack", "accel shift VK_LEFT");
pref("extensions.firebug.key.shortcut.navForward", "accel shift VK_RIGHT");
pref("extensions.firebug.key.shortcut.increaseTextSize", "accel +");
pref("extensions.firebug.key.shortcut.decreaseTextSize", "accel -");
pref("extensions.firebug.key.shortcut.normalTextSize", "accel 0");
pref("extensions.firebug.key.shortcut.help", "VK_F1");
pref("extensions.firebug.key.shortcut.toggleBreakOn", "accel alt b");

// Accessibility
pref("extensions.firebug.a11y.enable", false);
