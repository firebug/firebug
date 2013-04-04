function runTest() // special function name used by FBTest
{
    FBTest.sysout("issue882.START");  // These messages are shown in the trace console if DBG_TESTCASE is true

    // basePath is set by FBTestFirebug
    FBTest.openNewTab(basePath + "console/882/issue882.html", function(win)
    {
        var panelWindow = FBTest.getPanelDocument().defaultView;

        // Use Chromebug to inspect the Firebug UI for elements you want to verify
        var lookForLogRow = new MutationRecognizer(panelWindow, "span", {"class": "objectBox-text"}, "external");

        var done = function()
        {
            FBTest.testDone("issue882.DONE");
        };

        lookForLogRow.onRecognize(function sawLogRow(elt)
        {
            FBTest.progress("matched objectBox-text", elt);  // shown in the Test Console
            checkConsoleSourceLinks(elt, done);
        });

        // During the reload the MutationRecognizer executes and logs
        // into the Console panel. After the load finishes we can
        // finish the test.
        FBTest.selectPanel("console");
        FBTest.enableConsolePanel(function(win) // causes reload
        {
            FBTest.enableScriptPanel(function(win) // causes reload
            {
                FBTest.selectPanel("console");
                var button = win.document.getElementById("button");
                FBTest.click(button);
            });
        });
    });
}

function checkConsoleSourceLinks(elt, callback)
{
    FBTest.progress("checking source links");
    var panelNode = elt.parentNode.parentNode;
    FBTest.sysout("Using panelNode "+panelNode.getAttribute("class"));
    var links = panelNode.getElementsByClassName("objectLink-sourceLink");
    FBTest.compare("2 sourcelinks", links.length+" sourcelinks", "The test case shows two source links");

    var logLink = links[0].firstChild; // after R4847 there is a div around the text of the link
    FBTest.compare(FW.FBL.$STRF("Line", ["issue882.html", 11]), logLink.innerHTML, "Line 11 should be linked");

    var externalLink = links[1].firstChild;
    FBTest.compare(FW.FBL.$STRF("Line", ["external.js", 2]), externalLink.innerHTML, "Line 2 of external.js should be linked");

    // Now set a new recognizer for the highlight in the script panel
    var panelWindow = FBTest.getPanelDocument().defaultView;
    var sourceLineHighlight = new MutationRecognizer(panelWindow, 'div', {"class": "jumpHighlight"});

    sourceLineHighlight.onRecognize(function sawHighlight(elt)
    {
        FBTest.compare("sourceRow jumpHighlight", elt.getAttribute("class"),
            "Line is highlighted");  // shown in the Test Console
        callback();
    });

    FBTest.progress("Click the 'external' source link");
    FBTest.click(externalLink);  // click the source link to test the highlighting
}
