
// Global
pref("extensions.firebug.defaultPanelName", "html");
pref("extensions.firebug.throttleMessages", true);
pref("extensions.firebug.textSize", 0);
pref("extensions.firebug.showInfoTips", true);
pref("extensions.firebug.largeCommandLine", false);
pref("extensions.firebug.textWrapWidth", 100);
pref("extensions.firebug.openInWindow", false);
pref("extensions.firebug.showErrorCount", true);
pref("extensions.firebug.viewPanelOrient", "vertical");

pref("extensions.firebug.preferEnabled.Console", false);
pref("extensions.firebug.preferEnabled.Script", false);
pref("extensions.firebug.preferEnabled.Net", false);

pref("extensions.firebug.allowDoublePost", false);

// Console
pref("extensions.firebug.showJSErrors", true);
pref("extensions.firebug.showJSWarnings", false);
pref("extensions.firebug.showCSSErrors", false);
pref("extensions.firebug.showXMLErrors", false);
pref("extensions.firebug.showChromeErrors", false);
pref("extensions.firebug.showChromeMessages", false);
pref("extensions.firebug.showExternalErrors", false);
pref("extensions.firebug.showXMLHttpRequests", true);
pref("extensions.firebug-service.showStackTrace", true);
pref("extensions.firebug.console.logLimit", 500);
pref("extensions.firebug.console.enableLocalFiles", "");
pref("extensions.firebug.console.enableSystemPages", "");
pref("extensions.firebug.console.enableSites", false);

// HTML
pref("extensions.firebug.showCommentNodes", false);
pref("extensions.firebug.showWhitespaceNodes", false);
pref("extensions.firebug.showFullTextNodes", true);
pref("extensions.firebug.highlightMutations", true);
pref("extensions.firebug.expandMutations", false);
pref("extensions.firebug.scrollToMutations", false);
pref("extensions.firebug.shadeBoxModel", true);

// CSS
pref("extensions.firebug.showComputedStyle", false);

// Script
pref("extensions.firebug-service.breakOnErrors", false);
pref("extensions.firebug-service.filterSystemURLs", true);
pref("extensions.firebug-service.showAllSourceFiles", false);
pref("extensions.firebug-service.trackThrowCatch", false);
pref("extensions.firebug.script.enableLocalFiles", "");
pref("extensions.firebug.script.enableSystemPages", "");
pref("extensions.firebug.script.enableSites", false);
pref("extensions.firebug-service.scriptsFilter", "all");

// Stack
pref("extensions.firebug.omitObjectPathStack", false);

// DOM
pref("extensions.firebug.showUserProps", true);
pref("extensions.firebug.showUserFuncs", true);
pref("extensions.firebug.showDOMProps", true);
pref("extensions.firebug.showDOMFuncs", false);
pref("extensions.firebug.showDOMConstants", false);

// Layout
pref("extensions.firebug.showAdjacentLayout", false);
pref("extensions.firebug.showRulers", true);

// Net
pref("extensions.firebug.netFilterCategory", "all");
pref("extensions.firebug.collectHttpHeaders", true);
pref("extensions.firebug.net.logLimit", 500);
pref("extensions.firebug.net.enableLocalFiles", "");
pref("extensions.firebug.net.enableSystemPages", "");
pref("extensions.firebug.net.enableSites", false);

// External Editors
pref("extensions.firebug.externalEditors", "");

// Trace  /*@explore*/
pref("extensions.firebug-service.DBG_FBS_JSDCONTEXT", false);// firebug-service trace scriptinfo(huge) /*@explore*/
pref("extensions.firebug-service.DBG_FBS_FF_START", false); // firebug-service trace from FF start(huge) /*@explore*/
pref("extensions.firebug-service.DBG_FBS_CREATION", false); // firebug-service script creation           /*@explore*/
pref("extensions.firebug-service.DBG_FBS_BP", false);       // firebug-service breakpoints               /*@explore*/
pref("extensions.firebug-service.DBG_FBS_SRCUNITS", false); // firebug-service script creation           /*@explore*/
pref("extensions.firebug-service.DBG_FBS_ERRORS", false);   // firebug-service errors                    /*@explore*/
pref("extensions.firebug-service.DBG_FBS_FINDDEBUGGER", false);   // firebug-service findDebugger        /*@explore*/
pref("extensions.firebug-service.DBG_FBS_STEP", false);     // firebug-service stepping                  /*@explore*/
pref("extensions.firebug-service.DBG_FBS_FUNCTION", false); // firebug-service new Function              /*@explore*/
pref("extensions.firebug.DBG_BP", false); 			// debugger.js and firebug-services.js; lots of output   /*@explore*/
pref("extensions.firebug.DBG_TOPLEVEL", false); 	// top level jsd scripts                     /*@explore*/
pref("extensions.firebug.DBG_STACK", false);  		// call stack, mostly debugger.js            /*@explore*/
pref("extensions.firebug.DBG_UI_LOOP", false); 		// debugger.js                               /*@explore*/
pref("extensions.firebug.DBG_ERRORS", false);  		// error.js                                  /*@explore*/
pref("extensions.firebug.DBG_EVENTS", false);  		// debugger.js for event handlers, need more /*@explore*/
pref("extensions.firebug.DBG_FUNCTION_NAMES", false);  // heuristics for anon functions          /*@explore*/
pref("extensions.firebug.DBG_EVAL", false);    		// debugger.js and firebug-service.js        /*@explore*/
pref("extensions.firebug.DBG_PANELS", false);  		// panel selection                           /*@explore*/
pref("extensions.firebug.DBG_CACHE", false);   		// sourceCache                               /*@explore*/
pref("extensions.firebug.DBG_CONSOLE", false);        // console                                   /*@explore*/
pref("extensions.firebug.DBG_CSS", false);          //                                             /*@explore*/
pref("extensions.firebug.DBG_DBG2FIREBUG", false);  //                                             /*@explore*/
pref("extensions.firebug.DBG_DOM", false);  //                                             /*@explore*/
pref("extensions.firebug.DBG_DISPATCH", false);     //                                          /*@explore*/
pref("extensions.firebug.DBG_HTML", false);         //                                          /*@explore*/
pref("extensions.firebug.DBG_LINETABLE", false);    // /*@explore*/
pref("extensions.firebug.DBG_SOURCEFILES", false); 	// debugger and sourceCache                  /*@explore*/
pref("extensions.firebug.DBG_WINDOWS", false);    	// tabWatcher, dispatch events; very useful for understand modules/panels  /*@explore*/
pref("extensions.firebug.DBG_NET", false);        	// net.js                                    /*@explore*/
pref("extensions.firebug.DBG_INITIALIZE", false);   // registry (modules panels); initialize FB  /*@explore*/
pref("extensions.firebug.DBG_INSPECT", false);   // inspector  /*@explore*/
pref("extensions.firebug.DBG_OPTIONS", false);      // /*@explore*/
pref("extensions.firebug-service.DBG_FBS_FLUSH", false); // /*@explore*/
