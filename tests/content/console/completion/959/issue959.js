function runTest()
{
    FBTest.setPref("commandLineShowCompleterPopup", true);
    FBTest.openNewTab(basePath + "console/completion/959/issue959.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            FBTest.enableConsolePanel(function(win)
            {
                var panel = FW.Firebug.chrome.selectPanel("console");

                var doc = FW.Firebug.chrome.window.document;
                var cmdLine = doc.getElementById("fbCommandLine");
                var completionBox = doc.getElementById("fbCommandLineCompletion");
                var popup = doc.getElementById("fbCommandLineCompletionList");
                cmdLine.value = "";

                function testWithPopup(callback, expr, wanted, wantedPopup)
                {
                    // To save on time, only send the last character as a key press.
                    cmdLine.focus();
                    cmdLine.value = expr.slice(0, -1);
                    FBTest.synthesizeKey(expr.slice(-1), null, win);

                    if (wanted)
                    {
                        FBTest.compare(wanted, completionBox.value.substr(expr.length),
                            "Completing \"" + expr + "|" + wanted + "\"");
                        FBTest.compare(wantedPopup, (popup.state !== "closed"),
                            "Completion box should " + (wantedPopup ? "" : "not ") + " open.");
                    }
                    else
                    {
                        FBTest.compare("", completionBox.value, "\"" + expr + "\" should not complete.");
                    }

                    callback();
                }

                function testHidden(callback, expr)
                {
                    // Add one shown property - if the popup shows there must have been
                    // another one before.
                    // (N.B., in the case expr = "''.fontco" the eval doesn't
                    // work, but this is okay because the correct property is set
                    // on String.prototype just before.)
                    win.wrappedJSObject.eval(expr + "2 = 0");

                    cmdLine.focus();
                    cmdLine.value = expr.slice(0, -1);
                    FBTest.synthesizeKey(expr.slice(-1), null, win);
                    FBTest.compare("closed", popup.state, "Completion box should not open.");

                    callback();
                }

                var tasks = new FBTest.TaskList();
                tasks.push(testWithPopup, "Object.prototype.", "toString", true);
                tasks.push(testWithPopup, "Object.", "prototype", true);
                tasks.push(testWithPopup, "Object.getOwn", "PropertyNames", true);
                tasks.push(testWithPopup, "do", "cument", false);
                tasks.push(testWithPopup, "document._", "_proto__", false);
                tasks.push(testWithPopup, "obj1.", "aa1", true);
                tasks.push(testWithPopup, "obj2.", "aa1", true);
                tasks.push(testWithPopup, "obj3.", "", false);
                tasks.push(testWithPopup, "obj3.t", "oString", false);
                tasks.push(testWithPopup, "false.he", "llo", true);

                tasks.push(testHidden, "String.prototype.fontco");
                tasks.push(testHidden, "''.fontco");
                tasks.push(testHidden, "propertyis");
                tasks.push(testHidden, "document.body.__lo");
                tasks.push(testHidden, "alert.arg");
                tasks.push(testHidden, "document.body.vLin");

                tasks.run(function()
                {
                    FBTest.testDone();
                }, 0);
            });
        });
    });
}
