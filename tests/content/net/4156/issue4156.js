function runTest()
{
    FBTest.openNewTab(basePath + "net/4156/issue4156.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            FBTest.enableNetPanel(function(win)
            {
                FBTest.progress("Test setting multiple filters");

                clickToolbarButton("fbNetFilter-css");
                clickToolbarButton("fbNetFilter-js", true);
                clickToolbarButton("fbNetFilter-image", true);

                verifyNetPanelDisplay(["fbNetFilter-css", "fbNetFilter-js", "fbNetFilter-image"],
                    ["testcase.css", "issue4156-test.js", "firebug.png"]);

                FBTest.progress("Test unsetting filters");

                clickToolbarButton("fbNetFilter-js", true);

                verifyNetPanelDisplay(["fbNetFilter-css", "fbNetFilter-image"],
                        ["testcase.css", "firebug.png"]);

                clickToolbarButton("fbNetFilter-css", true);
                clickToolbarButton("fbNetFilter-image", true);

                FBTest.progress("Test unsetting all filters");

                verifyNetPanelDisplay(["fbNetFilter-all"],
                    ["issue4156.html", "testcase.css", "issue4156-test.js", "firebug.png"]);

                FBTest.testDone();
            });
        });
    });
}

//********************************************************************************************* //
// Helpers

function clickToolbarButton(buttonID, ctrlKey)
{
    var doc = FW.Firebug.chrome.window.document;
    var button = doc.getElementById(buttonID);
    FBTest.sysout("Click toolbar button " + buttonID, button);

    var eventDetails = {ctrlKey: ctrlKey};
    // Offset should better be calculated to avoid problems in relation with different OS themes
    FBTest.synthesizeMouse(button, 4, 4, eventDetails);
}

function verifyNetPanelDisplay(enabledFilters, displayedRequests)
{
    // Check whether the correct filter buttons are pressed
    var doc = FW.Firebug.chrome.window.document;
    var buttons = doc.getElementsByClassName("fbNetFilter");

    for (var i=0; i<buttons.length; ++i)
    {
        var filterMustBeEnabled = false;
        for (var j=0; j<enabledFilters.length; ++j)
        {
            if (buttons[i].id == enabledFilters[j])
            {
                filterMustBeEnabled = true;
                break;
            }
        }

        FBTest.ok((filterMustBeEnabled && buttons[i].checked) ||
            (!filterMustBeEnabled && !buttons[i].checked), "Filter '" + buttons[i].label
                + "' must" + (filterMustBeEnabled ? "" : " not") + " be enabled");
    }

    // Check whether the correct requests are displayed
    var panelNode = FBTest.getSelectedPanel().panelNode;
    var requests = panelNode.getElementsByClassName("netRow loaded");
    for (var i=0; i<requests.length; ++i)
    {
        var repObject = requests[i].repObject;
        if (FBTest.ok(repObject, "Request must have a corresponding repObject"))
        {
            var requestMustBeShown = false;
            for (var j=0; j<displayedRequests.length; ++j)
            {
                    if (repObject.href.lastIndexOf(displayedRequests[j]) != -1)
                    {
                        requestMustBeShown = true;
                        break;
                    }
            }

            var cs = requests[i].ownerDocument.defaultView.getComputedStyle(requests[i]);
            FBTest.ok((requestMustBeShown && cs.display != "none") ||
                (!requestMustBeShown && cs.display == "none"), "Request to '" +
                    repObject.href.substr(repObject.href.lastIndexOf("/") + 1)
                    + "' must" + (requestMustBeShown ? "" : " not") + " be shown");
        }
    }
}
