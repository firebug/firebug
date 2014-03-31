function runTest()
{
    FBTest.openNewTab(basePath + "net/1927/issue1927.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            FBTest.enableNetPanel(function(win)
            {
                var panel = FW.Firebug.chrome.selectPanel("net");
                FBTest.click(win.document.getElementById("testButton"));

                waitForDialogLoaded(function(win)
                {
                    fireDialogCommand(win, "accept", function()
                    {
                        waitForDialogLoaded(function(win)
                        {
                            fireDialogCommand(win, "cancel", function()
                            {
                                setTimeout(function()
                                {
                                    verifyNetResponse();
                                    FBTest.testDone();
                                }, 500);
                            });
                        });
                    });
                });
            });
        });
    });
}

function verifyNetResponse()
{
    var panel = FBTest.getPanel("net");
    var netRow = panel.panelNode.querySelector(
        ".netRow.category-xhr.hasHeaders.loaded");

    if (!FBTest.ok(netRow, "There must be one xhr request."))
        return;

    FBTest.click(netRow);

    // Expand the test request entry
    var netInfoRow = netRow.nextSibling;
    FBTest.expandElements(netInfoRow, "netInfoResponseTab");

    var responseBody = panel.panelNode.querySelector(
        ".netInfoResponseText.netInfoText");

    if (!FBTest.ok(responseBody, "Response tab must exist"))
        return;

    FBTest.compare("TEST",
        responseBody.textContent, "Test response must match: '" + responseBody.textContent + "'");
}

// ********************************************************************************************* //

// xxxHonza: could be part of FBTest namespace.
function waitForDialogLoaded(callback)
{
    var listener =
    {
        onOpenWindow: function(win)
        {
            wm.removeListener(listener);
            var requestor = win.docShell.QueryInterface(Ci.nsIInterfaceRequestor);
            var domWindow = requestor.getInterface(Ci.nsIDOMWindow);
            function domWindowLoaded()
            {
                domWindow.removeEventListener("load", domWindowLoaded, true);
                FBTest.progress("dialog loaded");
                callback(domWindow);
            }
            domWindow.addEventListener("load", domWindowLoaded, true);
        }
    }
    var wm = FW.FBL.CCSV("@mozilla.org/appshell/window-mediator;1", "nsIWindowMediator");
    wm.addListener(listener);
}

function fireDialogCommand(win, dlgType, callback)
{
    function onDialogClosed()
    {
        FBTest.progress("Dialog closed");
        win.removeEventListener("load", onDialogClosed, true);
        callback();
    }

    win.addEventListener("unload", onDialogClosed, true);

    setTimeout(function()
    {
        FBTest.progress("Fire command: " + dlgType);
        win.document.documentElement._doButtonCommand(dlgType);
    }, 200);
}
