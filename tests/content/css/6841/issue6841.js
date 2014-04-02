function runTest()
{
    FBTest.openNewTab(basePath + "css/6841/issue6841.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            FBTest.selectPanel("html");
            FBTest.selectElementInHtmlPanel("element1", function(node)
            {
                var panel = FBTest.selectSidePanel("css");
                var values = panel.panelNode.querySelectorAll(".cssPropValue");
                FBTest.compare(0, !values.length, "There must be at least one CSS value.");

                // Click the CSS value to open the inline editor.
                FBTest.synthesizeMouse(values[3]);

                var testCompletion = function(callback, prop, from, to)
                {
                    FBTest.synthesizeKey("VK_TAB", null, win);

                    var editor = panel.panelNode.querySelector(".textEditorInner");
                    if (!FBTest.ok(editor, "Editor must be available"))
                        throw "fail";
                    editor.value = prop.slice(0, -1);
                    FBTest.synthesizeKey(prop.slice(-1), null, win);
                    FBTest.synthesizeKey("VK_TAB", null, win);

                    editor = panel.panelNode.querySelector(".textEditorInner");
                    if (!FBTest.ok(editor, "Editor must be available"))
                        throw "fail";
                    editor.value = from.slice(0, -1);
                    FBTest.synthesizeKey(from.slice(-1), null, win);
                    FBTest.compare(to, editor.value, "Completing \"" + prop + "\", \"" + from + "\" → \"" + to + "\"");

                    callback();
                };

                var tasks = new FBTest.TaskList();
                tasks.push(testCompletion, "text-transform", "up", "uppercase");
                tasks.push(testCompletion, "-moz-appearance", "no", "none");
                tasks.push(testCompletion, "transition", "1s height, 1s col", "1s height, 1s color");
                tasks.push(testCompletion, "color", "w", "white");
                tasks.push(testCompletion, "color", "inac", "inactiveborder");
                tasks.push(testCompletion, "color", "rg", "rgb()");
                tasks.push(testCompletion, "height", "50px", "50px");
                tasks.push(testCompletion, "background-image", "line", "linear-gradient()");
                tasks.push(testCompletion, "background", "linea", "linear-gradient()");
                tasks.push(testCompletion, "background", "bl", "black");
                tasks.push(testCompletion, "background", "yellow bl", "yellow bl");
                tasks.push(testCompletion, "background", "yellow rep", "yellow repeat");
                tasks.push(testCompletion, "image-rendering", "opt", "optimizeSpeed");
                tasks.push(testCompletion, "pointer-events", "no", "none");
                tasks.push(testCompletion, "pointer-events", "vis", "vis");
                tasks.push(testCompletion, "content", "at", "attr()");
                tasks.push(testCompletion, "content", "ur", "url()");
                tasks.push(testCompletion, "content", "un", "unset");
                tasks.push(testCompletion, "font", "cal", "cal");

                // Miscellaneous other auto-completion tests:
                tasks.push(testCompletion, "border", "url(s", "url(s");

                tasks.run(FBTest.testDone, 0);
            });
        });
    });
}
