// Global
pref("javascript.options.strict.debug", false);
pref("extensions.firebug.defaultPanelName", "html");
pref("extensions.firebug.throttleMessages", true);
pref("extensions.firebug.textSize", 0);
pref("extensions.firebug.showInfoTips", true);
pref("extensions.firebug.largeCommandLine", false);
pref("extensions.firebug.textWrapWidth", 100);
pref("extensions.firebug.openInWindow", false);
pref("extensions.firebug.previousPlacement", 0);
pref("extensions.firebug.showErrorCount", true);
pref("extensions.firebug.viewPanelOrient", "vertical");
pref("extensions.firebug.allPagesActivation", "none");
pref("extensions.firebug.hiddenPanels", "");                // List of hidden panels separated by a space
pref("extensions.firebug.panelTabMinWidth", 50);            // Minimum width of a panel tab [px] applied when there is no enough horizontal size for the tab bar.
pref("extensions.firebug.sourceLinkLabelWidth", 17);        // Maximum amount of characters for source link labels (displayed e.g. in CSS or Console panels)

pref("extensions.firebug.preferEnabled.Console", false);
pref("extensions.firebug.preferEnabled.Script", false);
pref("extensions.firebug.preferEnabled.Net", false);

pref("extensions.firebug.allowDoublePost", false);
pref("extensions.firebug.activateSameOrigin", true);

// Search
pref("extensions.firebug.searchCaseSensitive", false);
pref("extensions.firebug.searchGlobal", true);

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
pref("extensions.firebug.service.showStackTrace", false);
pref("extensions.firebug.console.logLimit", 500);
pref("extensions.firebug.console.enableSites", false);
pref("extensions.firebug.persistBreakOnError", false);

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

// CSS
pref("extensions.firebug.showUserAgentCSS", false);
pref("extensions.firebug.expandShorthandProps", false);

// Script
pref("extensions.firebug.service.breakOnErrors", false);
pref("extensions.firebug.service.filterSystemURLs", true);
pref("extensions.firebug.service.showAllSourceFiles", false);
pref("extensions.firebug.service.trackThrowCatch", false);
pref("extensions.firebug.script.enableSites", false);
pref("extensions.firebug.decompileEvals", false);
pref("extensions.firebug.service.scriptsFilter", "all");

// If the value is greather than zero, the Script panel replaces tabs
// by corresponding number of spaces when displaying JavaScript source.
pref("extensions.firebug.replaceTabs", 4);

// Stack
pref("extensions.firebug.omitObjectPathStack", false);

// DOM
pref("extensions.firebug.showUserProps", true);
pref("extensions.firebug.showUserFuncs", true);
pref("extensions.firebug.showDOMProps", true);
pref("extensions.firebug.showDOMFuncs", false);
pref("extensions.firebug.showDOMConstants", false);

// Layout
pref("extensions.firebug.showRulers", true);

// Net
pref("extensions.firebug.netFilterCategory", "all");
pref("extensions.firebug.collectHttpHeaders", true);
pref("extensions.firebug.net.logLimit", 500);
pref("extensions.firebug.net.enableSites", false);
pref("extensions.firebug.netDisplayedResponseLimit", 102400); // Maximum size limit for displayed responses [net, console panels].
pref("extensions.firebug.netDisplayedPostBodyLimit", 10240); // Maximum size limit for displayed post data source [net, console panels].
pref("extensions.firebug.net.hiddenColumns", "");   // List of hidden columns for the Net panel (space separated)
pref("extensions.firebug.netPhaseInterval", 1000);    // Specifies an interval (ms) after which a new phase (session) in the timeline graph is started. Set to 0 to not start new phase at all.
pref("extensions.firebug.sizePrecision", 1);       // Number of displayed decimal places for size info in the UI. Allowed values: [-1 (all in bytes), 0 (no decimal places), 1 (one decimal place), 2 (two decimal places)]
pref("extensions.firebug.netParamNameLimit", 25);       // Maximum size [characters] of displayed parameter names in the Net panel (post tab). No limit if zero or less.

// Cache
pref("extensions.firebug.cache.mimeTypes", ""); // list of additional cached mime-types separated by space.
pref("extensions.firebug.cache.responseLimit", 5242880); // maximum size limit for cached response.

// External Editors
pref("extensions.firebug.externalEditors", "");

// Trace                                                        /*@explore*/
pref("extensions.firebug.enableTraceConsole", true);            /*@explore*/
pref("extensions.firebug.alwaysOpenTraceConsole", false);       /*@explore*/
pref("extensions.firebug.trace.maxMessageLength", 400);         /*@explore*/
pref("extensions.firebug.trace.enableScope", false);            /*@explore*/
pref("extensions.firebug.trace.showTime", false);               /*@explore*/
pref("extensions.firebug.DBG_FBS_JSDCONTEXT", false);// firebug trace scriptinfo(huge)   /*@explore*/
pref("extensions.firebug.DBG_FBS_FF_START", false); // firebug trace from FF start(huge) /*@explore*/
pref("extensions.firebug.DBG_FBS_CREATION", false); // firebug script creation           /*@explore*/
pref("extensions.firebug.DBG_FBS_BP", false);       // firebug breakpoints               /*@explore*/
pref("extensions.firebug.DBG_FBS_SRCUNITS", false); // firebug script creation           /*@explore*/
pref("extensions.firebug.DBG_FBS_ERRORS", false);   // firebug errors                    /*@explore*/
pref("extensions.firebug.DBG_FBS_FINDDEBUGGER", false);   // firebug findDebugger        /*@explore*/
pref("extensions.firebug.DBG_FBS_STEP", false);     // firebug stepping                  /*@explore*/
pref("extensions.firebug.DBG_FBS_TRACKFILES", false); // dump all js files to disk       /*@explore*/
pref("extensions.firebug.DBG_FBS_FUNCTION", false); // firebug new Function              /*@explore*/
pref("extensions.firebug.DBG_ACTIVATION", false);   // firebug.js and tabWatcher.js      /*@explore*/
pref("extensions.firebug.DBG_BP", false);           // debugger.js and firebug-services.js; lots of output   /*@explore*/
pref("extensions.firebug.DBG_TOPLEVEL", false);     // top level jsd scripts                     /*@explore*/
pref("extensions.firebug.DBG_STACK", false);        // call stack, mostly debugger.js            /*@explore*/
pref("extensions.firebug.DBG_UI_LOOP", false);      // debugger.js                               /*@explore*/
pref("extensions.firebug.DBG_ERRORS", false);       // error.js                                  /*@explore*/
pref("extensions.firebug.DBG_FUNCTION_NAMES", false);  // heuristics for anon functions          /*@explore*/
pref("extensions.firebug.DBG_EVAL", false);         // debugger.js and firebug-service.js        /*@explore*/
pref("extensions.firebug.DBG_PANELS", false);       // panel selection                           /*@explore*/
pref("extensions.firebug.DBG_CACHE", false);        // sourceCache                               /*@explore*/
pref("extensions.firebug.DBG_CONSOLE", false);      // console                                   /*@explore*/
pref("extensions.firebug.DBG_CSS", false);          //                                           /*@explore*/
pref("extensions.firebug.DBG_DBG2FIREBUG", false);  //                                           /*@explore*/
pref("extensions.firebug.DBG_DOM", false);          //                                           /*@explore*/
pref("extensions.firebug.DBG_DOMPLATE", false);     // domplate engine                           /*@explore*/
pref("extensions.firebug.DBG_DISPATCH", false);     //                                           /*@explore*/
pref("extensions.firebug.DBG_HTML", false);         //                                           /*@explore*/
pref("extensions.firebug.DBG_LINETABLE", false);    //                                           /*@explore*/
pref("extensions.firebug.DBG_LOCATIONS", false);    // panelFileList                             /*@explore*/
pref("extensions.firebug.DBG_SOURCEFILES", false);  // debugger and sourceCache                  /*@explore*/
pref("extensions.firebug.DBG_WINDOWS", false);      // tabWatcher, dispatch events; very useful for understand modules/panels  /*@explore*/
pref("extensions.firebug.DBG_NET", false);          // net.js                                    /*@explore*/
pref("extensions.firebug.DBG_NET_EVENTS", false);   // net.js - network events                   /*@explore*/
pref("extensions.firebug.DBG_INITIALIZE", false);   // registry (modules panels); initialize FB  /*@explore*/
pref("extensions.firebug.DBG_INSPECT", false);      // inspector                                 /*@explore*/
pref("extensions.firebug.DBG_OPTIONS", false);      //                                           /*@explore*/
pref("extensions.firebug.DBG_FBS_FLUSH", false);    //                                           /*@explore*/
pref("extensions.firebug.DBG_HTTPOBSERVER", false); // Centralized HTTP Observer                 /*@explore*/
pref("extensions.firebug.DBG_SPY", false);          // spy.js                                    /*@explore*/
pref("extensions.firebug.DBG_JSONVIEWER", false);   // json explorer                             /*@explore*/
pref("extensions.firebug.DBG_EDITOR", false);       // Inline editors                            /*@explore*/
pref("extensions.firebug.DBG_SHORTCUTS", false);    // Keyboard shortcuts.                       /*@explore*/
pref("extensions.firebug.DBG_A11Y", false);         // a11y                                      /*@explore*/
pref("extensions.firebug.DBG_LOCALE", false);       // localization, missing strings             /*@explore*/
pref("extensions.firebug.DBG_INFOTIP", false);      // popup info tip in panels                  /*@explore*/
pref("extensions.firebug.DBG_ANNOTATIONS", false);  // Page annotations service                  /*@explore*/
pref("extensions.firebug.DBG_XMLVIEWER", false);    // xml explorer                              /*@explore*/
pref("extensions.firebug.DBG_ACTIVITYOBSERVER", false);    // Net panel's activity observer      /*@explore*/
pref("extensions.firebug.DBG_TOOLTIP", false);      // tooltip debugging      /*@explore*/

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
pref("extensions.firebug.key.shortcut.openTraceConsole", "shift r");                             /*@explore*/

// Accessibility
pref("extensions.firebug.a11y.enable", false);

// Debugging
pref("extensions.firebug.clearDomplate", false);
