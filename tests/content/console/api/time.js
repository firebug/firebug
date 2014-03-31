function runTest()
{
    FBTest.openNewTab(basePath + "console/api/time.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            FBTest.enableConsolePanel(function(win)
            {
                var config = {tagName: "div", classes: "logRow logRow-info"};
                FBTest.waitForDisplayedElement("console", config, function(row)
                {
                    //var reTextContent = /a:\s*(\d+)ms\s*time\.html\s*\(line 32\)/;
                    var reTextContent = new RegExp("a:\\s*(\\d+)ms\\s*" +
                        FW.FBL.$STRF("Line", ["time.html", 33]).replace(/([\\"'\(\)])/g, "\\$1"))
                    var m = row.textContent.match(reTextContent);
                    FBTest.compare(reTextContent, row.textContent, "Logged textContent must be" +
                        "something like '" + reTextContent.toString() + "'");

                    var elapsed = m[1];
                    FBTest.ok(elapsed > 0 && elapsed < 2000, "The elapsed time should be within " +
                        "this range.");

                    FBTest.testDone();
                });

                // Execute test implemented on the test page.
                FBTest.click(win.document.getElementById("testButton"));
            });
        });
    });
}
