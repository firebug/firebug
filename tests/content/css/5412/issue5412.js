function runTest()
{
    function done()
    {
        FBTest.testDone();
    }

    FBTest.openNewTab(basePath + "css/5412/issue5412.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            var panel = FBTest.selectPanel("stylesheet");

            var editor = null;
            function selectLocation(callback, url, originalSelector)
            {
                FBTest.selectPanelLocationByName(panel, url);

                var selectors = panel.panelNode.getElementsByClassName("cssSelector");
                if (!FBTest.compare(1, selectors.length, "There must be one CSS selector"))
                {
                    done();
                    return;
                }

                FBTest.synthesizeMouse(selectors.item(0));
                editor = panel.panelNode.querySelector(".textEditorInner");
                if (!FBTest.ok(editor, "Editor must be available now"))
                {
                    done();
                    return;
                }
                FBTest.compare(originalSelector, editor.value, "The editor must contain the original value");
                callback();
            }

            function test(callback, input, output)
            {
                editor.value = "";
                editor.value = input.slice(0, -1);
                FBTest.synthesizeKey(input.slice(-1), null, win);
                FBTest.compare(output, editor.value, "Completing \"" + input + "\" → \"" + output + "\"");
                callback();
            }

            var tasks = new FBTest.TaskList();
            tasks.push(selectLocation, "issue5412.html", "#element1");
            tasks.push(test, "#", "#content");
            tasks.push(test, ".", ".a");
            tasks.push(test, "s", "span");
            tasks.push(test, "#e", "#element1");
            tasks.push(test, "#element1.", "#element1.element1");
            tasks.push(test, "#element1#", "#element1#");
            tasks.push(test, ".element1.", ".element1.");
            tasks.push(test, "section > h", "section > h3");
            tasks.push(test, "section>h", "section>h3");
            tasks.push(test, "#element1 .a.", "#element1 .a.second");
            tasks.push(test, "span, #element1 .a.", "span, #element1 .a.second");
            tasks.push(test, ".a[", ".a[");
            tasks.push(test, ".a[t", ".a[t");
            tasks.push(test, ".a[data-test=test].", ".a[data-test=test].second");
            tasks.push(test, ":", ":hover");
            tasks.push(test, "a::a", "a::after");
            tasks.push(test, "a::after:h", "a::after:h");
            tasks.push(test, "a:first-child::a", "a:first-child::after");
            tasks.push(test, "invalid]syntax:h", "invalid]syntax:h");
            tasks.push(test, ".second + .", ".second + .b");
            tasks.push(test, ".second ~ .", ".second ~ .b");
            tasks.push(test, ".second + #", ".second + #");
            tasks.push(test, ".second ~ #", ".second ~ #");
            tasks.push(test, ".second #", ".second #");
            tasks.push(test, ".second > #", ".second > #");
            tasks.push(test, "* #con", "* #content");
            tasks.push(test, "* > #con", "* > #content");
            tasks.push(test, "#frameel", "#frameel");
            tasks.push(selectLocation, "frame.html", "div");
            tasks.push(test, "#frameel", "#frameelement");

            tasks.run(function()
            {
                FBTest.synthesizeKey("VK_ESCAPE", null, win);
                done();
            }, 0);
        });
    });
}
