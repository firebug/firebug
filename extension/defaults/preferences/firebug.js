
// Global
pref("extensions.firebug.disabledAlways", false);
pref("extensions.firebug.allowSystemPages", false);
pref("extensions.firebug.disabledFile", true);
pref("extensions.firebug.defaultPanelName", "html");
pref("extensions.firebug.throttleMessages", true);
pref("extensions.firebug.textSize", 0);
pref("extensions.firebug.showInfoTips", true);
pref("extensions.firebug.largeCommandLine", false);
pref("extensions.firebug.textWrapWidth", 100);
pref("extensions.firebug.openInWindow", false);
pref("extensions.firebug.showErrorCount", true);

// Console
pref("extensions.firebug.showJSErrors", true);
pref("extensions.firebug.showJSWarnings", false);
pref("extensions.firebug.showCSSErrors", false);
pref("extensions.firebug.showXMLErrors", false);
pref("extensions.firebug.showChromeErrors", false);
pref("extensions.firebug.showChromeMessages", false);
pref("extensions.firebug.showExternalErrors", false);
pref("extensions.firebug.showXMLHttpRequests", true);
pref("extensions.firebug.showStackTrace", true);

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
pref("extensions.firebug.breakOnErrors", false);
pref("extensions.firebug.breakOnTopLevel", false);
pref("extensions.firebug.useDebugAdapter", false);
pref("extensions.firebug.showEvalSources", true);
pref("extensions.firebug.filterSystemURLs", true);
pref("extensions.firebug.showAllSourceFiles", false);
pref("extensions.firebug.trackThrowCatch", false);
pref("extensions.firebug.useLastLineForEvalName", false);
pref("extensions.firebug.useMD5ForEvalName", false);

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
pref("extensions.firebug.disableNetMonitor", false);
pref("extensions.firebug.collectHttpHeaders", true);

// External Editors
pref("extensions.firebug.externalEditors", "");

// Trace  /*@explore*/
pref("extensions.firebug.DBG_FBS_SCRIPTINFO", false);// firebug-service trace scriptinfo(huge) /*@explore*/
pref("extensions.firebug.DBG_FBS_FF_START", false); // firebug-service trace from FF start(huge) /*@explore*/
pref("extensions.firebug.DBG_FBS_CREATION", false); // firebug-service script creation           /*@explore*/
pref("extensions.firebug.DBG_FBS_BP", false);       // firebug-service breakpoints               /*@explore*/
pref("extensions.firebug.DBG_FBS_ERRORS", false);   // firebug-service errors                    /*@explore*/
pref("extensions.firebug.DBG_FBS_STEP", false);     // firebug-service stepping                  /*@explore*/
pref("extensions.firebug.DBG_FBS_FUNCTION", false); // firebug-service new Function              /*@explore*/
pref("extensions.firebug.DBG_BP", false); 			// debugger.js and firebug-services.js; lots of output   /*@explore*/
pref("extensions.firebug.DBG_TOPLEVEL", false); 	// top level jsd scripts                     /*@explore*/
pref("extensions.firebug.DBG_STACK", false);  		// call stack, mostly debugger.js            /*@explore*/
pref("extensions.firebug.DBG_UI_LOOP", false); 		// debugger.js                               /*@explore*/
pref("extensions.firebug.DBG_ERRORS", true);  		// error.js                                  /*@explore*/
pref("extensions.firebug.DBG_EVENTS", false);  		// debugger.js for event handlers, need more /*@explore*/
pref("extensions.firebug.DBG_FUNCTION_NAMES", false);  // heuristics for anon functions          /*@explore*/
pref("extensions.firebug.DBG_EVAL", false);    		// debugger.js and firebug-service.js        /*@explore*/
pref("extensions.firebug.DBG_PANELS", false);  		// panel selection                           /*@explore*/
pref("extensions.firebug.DBG_CACHE", false);   		// sourceCache                               /*@explore*/
pref("extensions.firebug.DBG_SOURCEFILES", false); 	// debugger and sourceCache                  /*@explore*/
pref("extensions.firebug.DBG_WINDOWS", false);    	// tabWatcher, dispatch events; very useful for understand modules/panels  /*@explore*/
pref("extensions.firebug.DBG_NET", false);        	// net.js                                    /*@explore*/
pref("extensions.firebug.DBG_SHOW_SYSTEM", false);  // isSystemURL return false always.          /*@explore*/
pref("extensions.firebug.DBG_INITIALIZE", false);   // registry (modules panels); initialize FB  /*@explore*/
pref("extensions.firebug.DBG_OPTIONS", false);      // /*@explore*/
pref("extensions.firebug.DBG_FLUSH_EVERY_LINE", false); // /*@explore*/
