// 1) Open test page.
// 2) Open Firebug and enable the Console panel.
// 3) Execute test on the page.
// 4) Verify UI in the Console panel.
function runTest()
{
    FBTest.openNewTab(basePath + "console/766/issue766.html", (win) =>
    {
        FBTest.openFirebug(() =>
        {
            FBTest.enableConsolePanel(() =>
            {
                var config = {
                    tagName: "div",
                    classes: "logRow logRow-log"
                }

                // Wait for an error log in the Console panel.
                FBTest.waitForDisplayedElement("console", config, (element) =>
                {
                    var log = element.
                        getElementsByClassName("objectBox objectBox-array hasTwisty")[0];
                    FBTest.ok(log, "There must be an expandable button");

                    FBTest.click(log);

                    var arrayProps = element.getElementsByClassName("arrayProperties")[0];
                    var domTable = element.getElementsByClassName("domTable")[0];
                    FBTest.ok(domTable, "There must be a list of expanded properties");

                    var props = element.getElementsByClassName("memberLabelCell");
                    var values = element.getElementsByClassName("memberValueCell");

                    FBTest.ok(props.length == 2, "There must be two properties");
                    FBTest.ok(values.length == 2, "There must be two values");

                    FBTest.compare(props[0].textContent, "key-1", "The key must be == 'key-1'");
                    FBTest.compare(props[1].textContent, "key-2", "There key must be == 'key-2'");
                    FBTest.compare(values[0].textContent, "\"test1\"",
                        "There value must be == 'test1'");
                    FBTest.compare(values[1].textContent, "\"test2\"",
                        "There value must be == 'test2'");

                    FBTest.testDone();
                });

                // Run test implemented on the page.
                FBTest.click(win.document.getElementById("testButton"));
            });
        });
    });
}
