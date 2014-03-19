/**
 * 1) Open two new tabs and firebug on it with Net panel selected.
 * 2) Disable and Enable net panel.
 * 3) Perform net request on the first tab and check net panel content.
 * 4) Perform net request on the second tab and check net panel content.
 */

var tab1 = null;
var tab2 = null;

function runTest()
{
    // Open two tabs one after another, open Firebug on both and select Net panel.
    tab1 = FBTest.openNewTab(basePath + "net/activation/activation1.html", function(win)
    {
        FBTest.progress("Opened new tab at "+win.location);
        FBTest.openFirebug(function()
        {
            FW.Firebug.chrome.selectPanel("net");
            tab2 = FBTest.openNewTab(basePath + "net/activation/activation2.html", function()
            {
                FBTest.progress("Opened new tab at "+win.location);
                FBTest.openFirebug(function ()
                {
                    FW.Firebug.chrome.selectPanel("net");
                    onRunTest();
                });
            });
        });
    });
}

function onRunTest(window)
{
    // Disable and enable
    FBTest.progress("Disable net panel");
    FBTest.disableNetPanel();
    FBTest.progress("Enable net panel");
    FBTest.enableNetPanel();

    // Select first tab, execute XHR and verify. Once it's done do the same for the other tab.
    selectTabAndVerify(tab1, function()
    {
        selectTabAndVerify(tab2, function()
        {
            FBTest.testDone();
        });
    });
}

function selectTabAndVerify(tab, callback)
{
    var tabbrowser = FBTest.getBrowser();
    tabbrowser.selectedTab = tab;

    var win = tab.linkedBrowser.contentWindow;
    FBTest.progress("Selected Firefox tab "+win.location);

    var options = {
        tagName: "tr",
        classes: "netRow category-xhr hasHeaders loaded"
    };

    // Asynchronously wait for the request beeing displayed.
    FBTest.waitForDisplayedElement("net", options, function(netRow)
    {
        FBTest.ok(netRow, "There must be one xhr request.");
        callback();
    });

    FBTest.click(win.document.getElementById("testButton"));
}
