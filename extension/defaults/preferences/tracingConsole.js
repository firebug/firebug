// Tracing Options
pref("extensions.firebug.DBG_A11Y", false);             // a11y
pref("extensions.firebug.DBG_ACTIVATION", false);       // firebug.js and tabWatcher.js
pref("extensions.firebug.DBG_ACTIVITYOBSERVER", false); // Net panel's activity observer
pref("extensions.firebug.DBG_ANNOTATIONS", false);      // Page annotations service
pref("extensions.firebug.DBG_BP", false);               // breakpoints
pref("extensions.firebug.DBG_CACHE", false);            // sourceCache
pref("extensions.firebug.DBG_COMMANDEDITOR", false);    // Multiline console based on SourceEditor
pref("extensions.firebug.DBG_COMMANDLINE", false);      // command line
pref("extensions.firebug.DBG_COMPILATION_UNITS", false);// (unused?)
pref("extensions.firebug.DBG_CONSOLE", false);          // console
pref("extensions.firebug.DBG_CSS", false);              //
pref("extensions.firebug.DBG_DISPATCH", false);         //
pref("extensions.firebug.DBG_DOM", false);              //
pref("extensions.firebug.DBG_DOMPLATE", false);         // domplate engine
pref("extensions.firebug.DBG_EDITOR", false);           // Inline editors
pref("extensions.firebug.DBG_ERRORS", false);           // error.js
pref("extensions.firebug.DBG_ERRORLOG", false);         // error.js
pref("extensions.firebug.DBG_EVENTLISTENERS", false);   // track/untrack for registered event listeners, restart needed
pref("extensions.firebug.DBG_EVENTS", false);           // browser generated events
pref("extensions.firebug.DBG_EXTERNALEDITORS", false);  // integration with external editors/IDEs
pref("extensions.firebug.DBG_FONTS", false);            // Fonts information and font viewer
pref("extensions.firebug.DBG_FUNCTION_NAMES", false);   // heuristics for anon functions
pref("extensions.firebug.DBG_HISTORY", false);          // panel navigation history
pref("extensions.firebug.DBG_HTML", false);             //
pref("extensions.firebug.DBG_HTTPOBSERVER", false);     // Centralized HTTP Observer
pref("extensions.firebug.DBG_INFOTIP", false);          // popup info tip in panels
pref("extensions.firebug.DBG_INITIALIZE", false);       // initialize FB
pref("extensions.firebug.DBG_INSPECT", false);          // inspector
pref("extensions.firebug.DBG_JSONVIEWER", false);       // JSON explorer
pref("extensions.firebug.DBG_LOCALE", false);           // localization, missing strings
pref("extensions.firebug.DBG_LOCATIONS", false);        // panelFileList
pref("extensions.firebug.DBG_MENU", false);             // Menus and context menus in Firebug
pref("extensions.firebug.DBG_MODULES", false);          // moduleloading
pref("extensions.firebug.DBG_NET", false);              // net.js
pref("extensions.firebug.DBG_NET_EVENTS", false);       // net.js - network events
pref("extensions.firebug.DBG_OBSERVERS", false);        // track/untrack support, should be set, then restart Firefox
pref("extensions.firebug.DBG_OPTIONS", false);          //
pref("extensions.firebug.DBG_PANELS", false);           // panel selection
pref("extensions.firebug.DBG_PROFILER", false);         // profiler
pref("extensions.firebug.DBG_REGISTRATION", false);     // registry (modules panels)
pref("extensions.firebug.DBG_SEARCH", false);           // search box
pref("extensions.firebug.DBG_SHORTCUTS", false);        // Keyboard shortcuts
pref("extensions.firebug.DBG_SOURCEFILES", false);      // (unused?)
pref("extensions.firebug.DBG_STACK", false);            // call stack, mostly debugger.js
pref("extensions.firebug.DBG_STORAGE", false);          // storageService
pref("extensions.firebug.DBG_SVGVIEWER", false);        // SVG explorer
pref("extensions.firebug.DBG_TOOLTIP", false);          // tooltip debugging
pref("extensions.firebug.DBG_WATCH", false);            // Watch expressions
pref("extensions.firebug.DBG_WINDOWS", false);          // tabWatcher, dispatch events; very useful for understanding modules/panels
pref("extensions.firebug.DBG_XMLVIEWER", false);        // XML explorer

// JSD2 Tracing, xxxHonza: should be generated automatically
pref("extensions.firebug.DBG_CONNECTION", false);       // Connection to the remote browser (for remote debugging)
pref("extensions.firebug.DBG_BTI", false);              // Browser Tools Interface
pref("extensions.firebug.DBG_DOMTREE", false);          // DomTree Widget
pref("extensions.firebug.DBG_SCRIPTVIEW", false);       // Script view is responsible for displaying JS source.
pref("extensions.firebug.DBG_DEBUGGERTOOL", false);     // DebuggerTool, implementing debugger actions and communicating with the server side.
