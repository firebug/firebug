function runTest()
{
    FBTest.sysout("issue6540.START");

    FBTest.openNewTab(basePath + "css/selectors/6540/issue6540.html", function(win)
    {
        FBTest.openFirebug();
        FBTest.selectPanel("selectors");

        FBTest.addSelectorTrial(null, "div", function(objectLink) {
            var config = {
                tagName: "a",
                classes: "objectLink-element"
            };

            FBTest.waitForDisplayedElement("selectors", config, function(row)
            {
                FBTest.testDone("issue6540.DONE");
            });

            var button = win.document.getElementById("addDIV");
            FBTest.click(button);
        });
    });
}
