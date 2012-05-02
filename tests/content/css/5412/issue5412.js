function runTest()
{
    FBTest.sysout("issue5412.START");

    function done()
    {
        FBTest.testDone("issue5412.DONE");
    }

    FBTest.openNewTab(basePath + "css/5412/issue5412.html", function(win)
    {
        FBTest.openFirebug();
        var panel = FBTest.selectPanel("stylesheet");

        FBTest.selectPanelLocationByName(panel, "issue5412.html");

        var selectors = panel.panelNode.getElementsByClassName("cssSelector");
        if (!FBTest.compare(1, selectors.length, "There must be one CSS selector"))
        {
            done();
            return;
        }

        FBTest.synthesizeMouse(selectors.item(0));
        var editor = panel.panelNode.querySelector(".textEditorInner");
        if (!FBTest.ok(editor, "Editor must be available now"))
        {
            done();
            return;
        }
        FBTest.compare("#element1", editor.value, "The editor must contain the original value");

        function test(callback, input, output)
        {
            editor.value = "";
            editor.value = input.slice(0, -1);
            FBTest.synthesizeKey(input.slice(-1), null, win);
            FBTest.compare(output, editor.value, "Completing \"" + input + "\" → \"" + output + "\"");
            callback();
        }

        var tasks = new FBTest.TaskList();
        tasks.push(test, "#", "#content");
        tasks.push(test, ".", ".a");
        tasks.push(test, "s", "span");
        tasks.push(test, "#e", "#element1");
        tasks.push(test, "#element1.", "#element1.element1");
        tasks.push(test, "#element1#", "#element1#");
        tasks.push(test, ".element1.", ".element1.");
        tasks.push(test, "section > h", "section > h1");
        tasks.push(test, "section>h", "section>h1");
        tasks.push(test, "#element1 .a.", "#element1 .a.second");
        tasks.push(test, "span, #element1 .a.", "span, #element1 .a.second");
        tasks.push(test, ".a[", ".a[");
        tasks.push(test, ".a[t", ".a[t");
        tasks.push(test, ".a[data-test=test].", ".a[data-test=test].second");
        tasks.push(test, ":", ":hover");
        tasks.push(test, "a:hover::a", "a:hover::after");

        tasks.run(function() {
            FBTest.synthesizeKey("VK_ESCAPE", null, win);
            done();
        }, 0);
    });
}
