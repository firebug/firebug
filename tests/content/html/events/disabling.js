function runTest()
{
    FBTest.openNewTab(basePath + "html/events/disabling.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            FBTest.selectPanel("html");
            var panel = FBTest.selectSidePanel("html-events");
            var {panelNode} = panel;

            var tasks = new FBTest.TaskList();
            tasks.push(selectElement, "testspan");
            tasks.push(test, win, "12");
            tasks.push(clickDisable, panelNode, 0);
            tasks.push(test, win, "2");
            tasks.push(clickDisable, panelNode, 0);
            tasks.push(test, win, "12");
            tasks.push(clickDisable, panelNode, 1);
            tasks.push(test, win, "1");
            tasks.push(clickDisable, panelNode, 1);
            tasks.push(test, win, "12");
            tasks.run(FBTest.testDone, 0);
        });
    });
}

function selectElement(callback, id)
{
    FBTest.selectElementInHtmlPanel(id, callback);
}

function clickDisable(callback, panelNode, index)
{
    var indents = panelNode.getElementsByClassName("listenerIndent");
    FBTest.compare(2, indents.length, "there must be 2 event listeners");
    FBTest.progress("clicking enable/disable button #" + index);
    FBTest.click(indents[index]);
    callback();
}

function test(callback, win, expected)
{
    var el = win.document.getElementById("testspan");
    el.click();
    var actual = win.wrappedJSObject.fetchHandlers();
    FBTest.compare(expected, actual, "the correct set of listeners must run");
    callback();
}
