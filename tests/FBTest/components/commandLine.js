/* See license.txt for terms of usage */

// ************************************************************************************************
// Constants

const CLASS_ID = Components.ID("{F483275E-ECC6-4028-B375-92498C0AD76F}");
const CLASS_NAME = "FBTest Command Line Handler";
const CONTRACT_ID = "@mozilla.org/commandlinehandler/general-startup;1?type=FBTest";
const CLD_CATEGORY = "m-FBTest";

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;

const categoryManager = Cc["@mozilla.org/categorymanager;1"].getService(Ci.nsICategoryManager);
const appShellService = Cc["@mozilla.org/appshell/appShellService;1"].getService(Ci.nsIAppShellService);

const CMDLINE_FLAG = "runFBTests";

Components.utils["import"]("resource://gre/modules/XPCOMUtils.jsm");

// ************************************************************************************************
// Command Line Handler

function CommandLineHandler()
{
    this.wrappedJSObject = this;
};

CommandLineHandler.prototype =
{
    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // XPCOM

    classID: CLASS_ID,
    classDescription: CLASS_NAME,
    contractID: CONTRACT_ID,

    QueryInterface: XPCOMUtils.generateQI([
        Ci.nsISupports,
        Ci.nsICommandLineHandler
    ]),

    _xpcom_categories: [{
        category: "command-line-handler",
        entry: CLD_CATEGORY,
    }],

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // nsICommandLineHandler

    runFBTests: false,
    testListURI: null,
    quitAfterRun: false,

    handle: function(cmdLine)
    {
        window = appShellService.hiddenDOMWindow;

        if (cmdLine.findFlag(CMDLINE_FLAG, false) < 0)
            return;

        try
        {
            // Handle flag with test URI specified. This throws an exception
            // if the parameter isn't specified.
            var testListURI = cmdLine.handleFlagWithParam(CMDLINE_FLAG, false);
            var quitAfterRun = cmdLine.handleFlag("quitAfterRun", false);
            this.startOnStartup(testListURI, quitAfterRun);
        }
        catch (e)
        {
            // So, the parameter isn't probably there. Try to handle at least the flag.
            // The default test list URI will be used.
            if (cmdLine.handleFlag(CMDLINE_FLAG, false))
                 this.startOnStartup(null);
        }
    },

    startOnStartup: function(testListURI, quitAfterRun)
    {
        if (!testListURI)
            window.dump("FBTest; No test list URI specified.");

        // This info will be used by FBTest overlay as soon as the browser window is loaded.
        this.runFBTests = true;
        this.testListURI = testListURI;
        this.quitAfterRun = quitAfterRun;

        window.dump("FBTest; FBTests will be executed as soon as Firefox is ready.\n");
        window.dump("FBTest; Test List URI: " + testListURI + "\n");
    },

    // The text should have embedded newlines which wrap at 76 columns, and should include
    // a newline at the end. By convention, the right column which contains flag descriptions
    // begins at the 24th character.
    // xxxHonza: weird is that if I run Firefox with -help parameter the second column
    // begins on 33th character.
    helpInfo: "  -" + CMDLINE_FLAG + " <test-list-uri>   Automatically run all Firebug tests \n" +
              "                https://getfirebug.com/tests/content/testlists/firebug1.6.html\n",
};

// ************************************************************************************************

/**
* XPCOMUtils.generateNSGetFactory was introduced in Mozilla 2 (Firefox 4).
* XPCOMUtils.generateNSGetModule is for Mozilla 1.9.2 (Firefox 3.6).
*/
if (XPCOMUtils.generateNSGetFactory)
    var NSGetFactory = XPCOMUtils.generateNSGetFactory([CommandLineHandler]);
else
    var NSGetModule = XPCOMUtils.generateNSGetModule([CommandLineHandler]);
