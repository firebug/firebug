function runTest()
{
    FBTest.openNewTab(basePath + "dom/6985/issue6985.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            // A non-dom panel, so we can test that inspect(, 'dom') works.
            FBTest.selectPanel("console");

            var opts = {
                showUserProps: true,
                showUserFuncs: true,
                showDOMProps: false,
                showDOMFuncs: false,
                showDOMConstants: false,
                showInlineEventHandlers: false,
                showOwnProperties: false,
                showEnumerableProperties: false,
            };
            for (var pref in opts)
                FW.Firebug.Options.set(pref, opts[pref]);

            function testEmpty(callback, expr)
            {
                // Use CommandLine.evaluate, so we don't have to switch panels.
                // As a bonus we get some extra test coverage for that.
                var evExpr = "inspect(" + expr + ", 'dom'); true";
                var res = null;
                var yes = () => res = true;
                var no = () => res = false;
                var context = FW.Firebug.currentContext;
                FW.Firebug.CommandLine.evaluate(evExpr, context, null, null, yes, no);
                FBTest.ok(res, "inspect() must succeed, synchronously");
                if (!res)
                    return callback();

                FBTest.waitForDOMProperty("custom_prop", function(row)
                {
                    FBTest.ok(row, "custom_prop must exist");
                    var rows = row.parentNode.getElementsByClassName("memberRow");
                    FBTest.compare(2, rows.length, "there must be only two properties");
                    FBTest.compare("__proto__", rows[1].childNodes[1].textContent,
                        "the other property must be __proto__");
                    callback();
                });
            }

            var tasks = new FBTest.TaskList();
            tasks.push(testEmpty, "window");
            tasks.push(testEmpty, "document");
            tasks.push(testEmpty, "document.body");
            tasks.push(testEmpty, "history");
            tasks.run(FBTest.testDone, 0);
        });
    });
}
