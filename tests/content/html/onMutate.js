function runTest()
{
    FBTest.openNewTab(basePath + "html/onMutate.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            FBTest.setPref("highlightMutations", true);
            FBTest.setPref("scrollToMutations", true);

            // A suite of asynchronous tests.
            var testSuite = new FBTest.TaskList();
            testSuite.push(onMutateText, win, "mutateText", false);
            testSuite.push(onMutateText, win, "mutateTextInline", true);
            testSuite.push(onMutateNode, win, "mutateNode");
            testSuite.push(onMutateNode, win, "mutateNodeText");
            testSuite.push(onMutateNode, win, "mutateNodeEmpty");
            testSuite.push(onRemoveNode, win, "removeNode", 1);
            testSuite.push(onRemoveNode, win, "removeNodeText", 0);
            testSuite.push(onRemoveNode, win, "removeNodeEmpty", 0);
            testSuite.push(onMutateAttr, win, "mutateAttrNew", "title", "boo");
            testSuite.push(onMutateAttr, win, "mutateAttrSet", "title", "boo");
            testSuite.push(onMutateAttr, win, "mutateAttrRemove", "title", undefined);
            testSuite.push(onMutateRemovedRace, win, "mutateRemovedRace");

            // Reload window to activate debugger and run all tests.
            FBTest.reload(function(win)
            {
                testSuite.run(function()
                {
                    FBTest.testDone();
                });
            });
        });
    });
}

function onMutateText(callback, win, id, inline)
{
    FBTest.progress("onMutateTest " + id);

    var mutateId = win.document.getElementById(id);
    waitForHtmlMutation(null, inline ? "span" : "div",
        inline ? mutateId.parentNode : mutateId, callback);

    FBTest.click(win.document.getElementById(id + "Button"));
}

function onMutateAttr(callback, win, id, attr, value)
{
    FBTest.progress("onMutateAttr " + id);

    var mutateId = win.document.getElementById(id);
    waitForHtmlMutation(null, value ? "span" : "div", mutateId, callback);

    if (value)
        mutateId.firstChild.setAttribute(attr, value);
    else
        mutateId.firstChild.removeAttribute(attr);

    FBTest.click(win.document.getElementById(id + "Button"));
}

function onMutateNode(callback, win, id)
{
    FBTest.progress("onMutateNode " + id);

    var counter = 0;
    function done()
    {
        if (++counter == 2)
            callback();
    }

    var mutateId = win.document.getElementById(id);
    waitForHtmlMutation(null, "div", mutateId.parentNode, done);
    waitForHtmlMutation(null, "div", null, done);

    FBTest.click(win.document.getElementById(id + "Button"));
}

function onRemoveNode(callback, win, id, index)
{
    FBTest.progress("onRemoveNode " + id);

    var mutateId = win.document.getElementById(id);
    waitForHtmlMutation(null, "div", mutateId.parentNode, callback);

    FBTest.click(win.document.getElementById(id + "Button"));
}

function onMutateRemovedRace(callback, win, id)
{
    FBTest.progress("onMutateRemovedRace " + id);

    var counter = 0;
    function done()
    {
        if (++counter == 3)
            callback();
    }

    var mutateId = win.document.getElementById(id);
    waitForHtmlMutation(null, "div", mutateId.parentNode, done);
    waitForHtmlMutation(null, "div", null, done);
    waitForHtmlMutation(null, "div", null, done);

    FBTest.click(win.document.getElementById(id + "Button"));
}

function waitForHtmlMutation(chrome, tagName, object, callback)
{
    FBTest.waitForHtmlMutation(chrome, tagName, function(node)
    {
        if (object)
        {
            var repObj = FW.Firebug.getRepObject(node);
            if (!repObj)
                repObj = FW.Firebug.getRepObject(node.getElementsByClassName("repTarget")[0]);

            FBTest.compare(object.innerHTML, repObj.parentNode.innerHTML, "Content matches");
            FBTest.compare(object, repObj.parentNode, "Objects matches");
        }

        callback(node);
    });
}
