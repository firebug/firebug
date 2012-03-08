function runTest()
{
    FBTest.sysout("console.log-xpathresult.START");
    FBTest.openNewTab(basePath + "console/api/log-xpathresult.html", function(win)
    {
        FBTest.openFirebug();
        FBTest.enableConsolePanel(function(win)
        {
            FBTest.clearConsole();

            var config = {tagName: "div", classes: "logRow logRow-log"};
            FBTest.waitForDisplayedElement("console", config, function(row)
            {
                FBTest.compare(/\s*[h2,\s*h2]\s*/,
                    row.textContent,
                    "XPathResult must be displayed as an array of elements.");

                var array = row.querySelector(".objectBox-array.hasTwisty");
                FBTest.ok(array, "The array must be expandable");

                FBTest.testDone("console.log-xpathresult.DONE");
            });

            FBTest.click(win.document.getElementById("testButton"));
        });
    });
}
