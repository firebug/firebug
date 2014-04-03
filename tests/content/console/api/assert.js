function runTest()
{
    FBTest.openNewTab(basePath + "console/api/assert.html", function(win)
    {
        FBTest.enablePanels(["console", "script"], function(win)
        {
            FBTest.setPref("filterSystemURLs", true);

            var doNotFilter = FBTest.getPref("filterSystemURLs");

            FBTest.compare(true, doNotFilter, "Pref filterSystemURLs must be set true");
            FBTest.compare(true, FW.Firebug.Options.get("filterSystemURLs"),
                "Pref Firebug.filterSystemURLs must be set true");

            var config = {tagName: "div", classes: "logRow logRow-errorMessage", counter: 2};
            FBTest.waitForDisplayedElement("console", config, function(row)
            {
                verifyConsoleUI(config);
                FW.Firebug.Console.clear();
                FBTest.setPref("filterSystemURLs", false);
                var filter = FBTest.getPref("filterSystemURLs");
                FBTest.compare(false, filter, "Pref filterSystemURLs must not be set true");
                FBTest.compare(false, FW.Firebug.Options.get("filterSystemURLs"),
                    "Pref filterSystemURLs must not be set true");
                FBTest.waitForDisplayedElement("console", config, function(row)
                {
                    verifyConsoleUI(config);
                    FBTest.testDone();
                });

                // Execute test implemented on the test page.
                FBTest.click(win.document.getElementById("testButton"));
            });

            // Execute test implemented on the test page.
            FBTest.click(win.document.getElementById("testButton"));
        });
    });
}

function verifyConsoleUI(config)
{
    var panelNode = FBTest.getPanel("console").panelNode;

    // Verify number of asserts
    var rows = panelNode.getElementsByClassName(config.classes);
    if (!FBTest.compare(2, rows.length, "There must be two logs (only negative are displayed)."))
        return;

    // Verify the first assert message.
    var reExpectedLog1 = new RegExp("negative\\s*console\.assert\\(false,\\s*\"negative\"\\);\\s*" +
        FW.FBL.$STRF("Line", ["assert.html", 43]).replace(/([\\"'\(\)])/g, "\\$1"));
    if (!FBTest.compare(reExpectedLog1, rows[0].textContent,
        "The log must be something like as follows: " +
        "negative    console.assert(false, \"negative\");\r\n" + FW.FBL.$STRF("Line", ["assert.html", 42])))
        return;

    // Verify the second assert message.
    var title = rows[1].getElementsByClassName("errorTitle")[0];
    FBTest.compare("negative with an object", title.textContent, "Verify error title");

    var objects = rows[1].getElementsByClassName("objectBox-array")[0];
    FBTest.compare(/[Object\s*{\s*a="b"\s*}, 15, \"asdfa\"]/, objects.textContent,
        "List of arguments must be displayed");

    // Verify stact trace presence.
    var errorTrace = rows[1].getElementsByClassName("errorTrace")[0];
    FBTest.ok(!errorTrace.textContent, "The trace info is hidden by default");
    FBTest.click(title);
    FBTest.ok(errorTrace.textContent, "Now it must be visible");
}
