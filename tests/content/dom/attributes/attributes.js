var expectedValue = /\[style="color:\s*green", name="testName", id="testId"\]/;
var expectedValue2 = /style="color:\s*green"/;

function runTest()
{
    FBTest.openNewTab(basePath + "dom/attributes/attributes.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            FBTest.enableConsolePanel(function(win)
            {
                FBTest.progress("console enabled, creating task list");
                var tasks = new FBTest.TaskList();
                tasks.push(testDomPanel);

                tasks.push(executeCommandAndVerify,
                    "$('#testId').attributes", expectedValue,
                    "a", "objectLink objectLink-NamedNodeMap");

                tasks.push(executeCommandAndVerify,
                    "$('#testId').attributes[0]", expectedValue2,
                    "a", "objectLink objectLink-Attr");

                tasks.run(function() {
                    FBTest.testDone();
                })
            });
        });
    });
}

function testDomPanel(callback)
{
    FBTest.searchInHtmlPanel("Inspect Me", function(sel)
    {
        FBTest.progress("Element found");

        var nodeTag = FW.FBL.getAncestorByClass(sel.anchorNode, "nodeText");
        FBTest.progress(nodeTag.className);

        FBTest.executeContextMenuCommand(nodeTag, "InspectIndomPanel", function()
        {
            var panel = FBTest.selectPanel("dom");
            var rows = panel.panelNode.querySelectorAll(".memberRow.domRow.hasChildren");

            FBTest.waitForDOMProperty("attributes", function(row)
            {
                var value = row.querySelector(".memberValueCell");
                FBTest.compare(expectedValue, value.textContent,
                    "Attributes list must match: " + value.textContent);
                callback();
            }, true);
        });
    })
}

// xxxHonza: Should be in FBTest (see also commandLine/api.js), what about the callback?
function executeCommandAndVerify(callback, expression, expected, tagName, classes)
{
    var config = {tagName: tagName, classes: classes};
    FBTest.waitForDisplayedElement("console", config, function(row)
    {
        FBTest.compare(expected, row.textContent, "Verify: " +
            expression + " SHOULD BE " + expected);

        FBTest.clickToolbarButton(null, "fbConsoleClear");
        callback();
    });

    FBTest.progress("execute "+expression);
    FBTest.executeCommand(expression);
}
