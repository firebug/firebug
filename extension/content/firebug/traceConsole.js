/* See license.txt for terms of usage */

// Constants
//-----------------------------------------------------------------------------

const Cc = Components.classes;
const Ci = Components.interfaces;

var gFindBar;

// Implementation
//-----------------------------------------------------------------------------

var Console =
{
    modules: [],

    onLoad: function()
    {
        var args = window.arguments[0];

        FBL = args.FBL;
        Firebug = args.Firebug;
        
        this.activeModule = args.traceModule;
    
        var consoleFrame = document.getElementById("consoleFrame");
        this.consoleNode = consoleFrame.contentDocument.getElementById("panelNode-traceConsole");

        // Associate Console with the module object.
        this.activeModule.onLoadConsole(window, this.consoleNode);
        this.registerModule(this.activeModule);

        // Find toolbar
        gFindBar = document.getElementById("FindToolbar");
    },

    onUnload: function()
    {
        for (var i=0; i<this.modules.length; ++i)
            this.modules[i].onUnloadConsole();
    },
    
    registerModule: function(module)
    {
        module.consoleRoot = this.activeModule.consoleRoot;
        this.modules.push(module);
    },

    unregisterModule: function(module)
    {
        for (var i=0; i<this.modules.length; ++i) {
            if (this.modules[i] == item) {
                this.modules.splice(i, 1);
                break;
            }
        }
    },

    // Commands
    onClearConsole: function()
    {
        var tbody = this.consoleNode.firstChild.firstChild;
        while (tbody.firstChild)
            tbody.removeChild(tbody.lastChild);
    },
    
    onSeparateConsole: function()
    {
        this.activeModule.dumpSeparator();
    },
    
    onSaveToFile: function()
    {
    },

    onRestartFirefox: function()
    {
        Cc["@mozilla.org/toolkit/app-startup;1"].getService(Ci.nsIAppStartup).
            quit(Ci.nsIAppStartup.eRestart | Ci.nsIAppStartup.eAttemptQuit);
    },
    
    onExitFirefox: function()
    {
        goQuitApplication();
    }
}

//-----------------------------------------------------------------------------
