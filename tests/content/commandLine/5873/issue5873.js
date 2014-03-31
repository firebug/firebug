function runTest()
{
    FBTest.setPref("commandLineShowCompleterPopup", true);
    FBTest.openNewTab(basePath + "commandLine/5873/issue5873.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            FBTest.enablePanels(["console", "script"], function()
            {
                var doc = FW.Firebug.chrome.window.document;
                var cmdLine = doc.getElementById("fbCommandLine");
                var completionBox = doc.getElementById("fbCommandLineCompletion");
                var popup = doc.getElementById("fbCommandLineCompletionList");
                cmdLine.value = "";

                function waitForOpen(callback)
                {
                    if (popup.state === "opening")
                    {
                        setTimeout(waitForOpen, 10, callback);
                        return;
                    }

                    if (popup.state === "closed")
                        FBTest.compare("open", "closed", "Completion popup should open.");

                    callback();
                }

                function createA(callback)
                {
                    // Run the code of createA in the Firebug command line.
                    function createA()
                    {
                        window.global = 1;
                        with({withVar: 2})
                        {
                            window.A = function(param)
                            {
                                function helper(x)
                                {
                                    return x + 4;
                                }
                                var local = 5, unused = 15;
                                try
                                {
                                    throw 6;
                                }
                                catch (catched)
                                {
                                    this.someFunction = function(someFuncParam)
                                    {
                                        return helper(global + withVar + param + local + catched + someFuncParam);
                                    };
                                }
                            };
                        }
                        window.a = new A(3);
                    }

                    var src = (createA + "").replace(/\n/g,' ').replace(/ +/g, ' ');
                    src += " createA();";
                    var sync = false;

                    FW.Firebug.CommandLine.evaluate(src, FW.Firebug.currentContext, undefined,
                        undefined, function()
                    {
                        sync = true;
                    }, function(e)
                    {
                        sync = true;
                        FBTest.compare(1, 0, "evaluation error: " + e);
                    });

                    FBTest.compare(true, sync, "Evaluation must be syncronous.");
                    callback();
                }

                function verifyNothingInjected(callback)
                {
                    FBTest.compare("undefined", typeof win.wrappedJSObject.__fb_scopedVars,
                        "The scope getter function must not yet be available to page content.");
                    callback();
                }

                function verifyCompletionPopupForA(callback)
                {
                    FBTest.typeCommand("a.%");
                    waitForOpen(function()
                    {
                        var completions = popup.getElementsByClassName("completionText");
                        var joined = [].slice.call(completions).map(function(el)
                        {
                            return el.textContent;
                        }).join(",");

                        var wanted = "catched,helper,local,param,unused,withVar";
                        FBTest.compare(wanted, joined, "The completion popup should show the right list of closure variables.");
                        cmdLine.value = "";
                        FBTest.setPref("commandLineShowCompleterPopup", false);
                        callback();
                    });
                }

                function testCompletion(callback, expr, shouldComplete)
                {
                    // To save on time, only send the last character as a key press.
                    cmdLine.focus();
                    cmdLine.value = expr.slice(0, -1);
                    FBTest.synthesizeKey(expr.slice(-1), null, win);

                    var hasCompletion = (completionBox.value.length > expr.length);
                    FBTest.compare(shouldComplete, hasCompletion,
                        "Completions should " + (shouldComplete ? "" : "not ") +
                        "appear for: " + expr);

                    callback();
                }

                function verifyParsing(callback)
                {
                    // Some unit tests for verifying parsing.
                    function tr(expr)
                    {
                        return FW.Firebug.JSAutoCompleter.transformScopeOperator(expr, "f");
                    }

                    var tests = [
                        ["a.%b", "f(a).b"],
                        ["a.%%b", "f(a).%b"],
                        ["a.%b.%c", "f(f(a).b).c"],
                        ["a\na.%b", "a\nf(a).b"],
                        ["anew\na.%b", "anew\nf(a).b"],
                        ["new\na.%b()", "new\n(f(a)).b()"],
                        ["a new\na.%b()", "a new\n(f(a)).b()"],
                        ["a.%b.%c", "f(f(a).b).c"],
                        ["z.a.%b.c.%d", "f(f(z.a).b.c).d"],
                        ["0.%a", "0.%a"],
                        ["'a.%a'", "'a.%a'"]
                    ];

                    for (var i = 0; i < tests.length; ++i)
                    {
                        var from = tests[i][0], to = tests[i][1];
                        FBTest.compare(to, tr(from), "Should transform |" + from + "| -> |" + to);
                    }

                    callback();
                }

                function testInDebugger(callback)
                {
                    function step0()
                    {
                        // Break into the debugger.
                        FBTest.waitForBreakInDebugger(null, 9, false, step1);
                        win.wrappedJSObject.breakSoon();
                    }
                    function step1()
                    {
                        // Test that completions work.
                        FBTest.clickConsolePreviewButton();
                        testCompletion(step2, "func.%pr", true);
                    }
                    function step2()
                    {
                        // Test that evaluations work.
                        FBTest.executeCommandAndVerify(step3, "a.%global",
                            "1", "span", "objectBox-number");
                    }
                    function step3()
                    {
                        // Set a conditional breakpoint with .% syntax.
                        // 
                        /*FBTest.setBreakpoint(null, null, 18, {
                            condition: "count.%counter === 4"
                        }, step4);*/

                        // Because of this issue: http://code.google.com/p/fbug/issues/detail?id=7265
                        // Skip the next steps until this issue is fixed.
                        step8();
                    }
                    /*function step4()
                    {
                        // Hit it.
                        FBTest.waitForBreakInDebugger(null, 18, true, step5);
                        FBTest.clickToolbarButton(null, "fbContinueButton");
                    }
                    function step5()
                    {
                        // Check that it hit at the right point.
                        FBTest.executeCommandAndVerify(step6, "i", "4", "span", "objectBox-number");
                    }
                    function step6()
                    {
                        // Remove the breakpoint.
                        FBTest.removeBreakpoint(null, null, 18, step7);
                    }
                    function step7()
                    {
                        // Resume.
                        FBTest.waitForDebuggerResume(step8);
                        FBTest.clickToolbarButton(null, "fbContinueButton");
                    }*/
                    function step8()
                    {
                        // Whew, done. Switch back to the console panel.
                        FBTest.selectPanel("console");
                        callback();
                    }
                    step0();
                }

                var taskList = new FBTest.TaskList();

                taskList.push(createA);
                taskList.push(verifyNothingInjected);
                taskList.push(verifyCompletionPopupForA);

                // Verify cross-compartment permissions
                taskList.push(FBTest.executeCommandAndVerify, "cd.%context",
                    "Error: permission denied to access cross origin scope", "span", "errorMessage");
                if ("sandbox" in document.createElement("iframe"))
                {
                    taskList.push(FBTest.executeCommandAndVerify, "frames[1].%framePriv",
                        "Error: permission denied to access cross origin scope", "span", "errorMessage");
                    taskList.push(FBTest.executeCommandAndVerify, "frames[1].location.%framePriv",
                        "Error: permission denied to access cross origin scope", "span", "errorMessage");
                }
                taskList.push(FBTest.executeCommandAndVerify, "frames[0].location.%framePriv",
                    "2", "span", "objectBox-number");
                taskList.push(FBTest.executeCommandAndVerify, "frames[0].%framePriv",
                    "2", "span", "objectBox-number");
                taskList.push(FBTest.executeCommandAndVerify, "frames[0].frameA.%framePriv",
                    "2", "span", "objectBox-number");

                // Test getting
                taskList.push(FBTest.executeCommandAndVerify, "a.%global",
                    "1", "span", "objectBox-number");
                taskList.push(FBTest.executeCommandAndVerify, "typeof a.%values",
                    "\"function\"", "span", "objectBox-string");
                taskList.push(FBTest.executeCommandAndVerify, "a.%nonExistent",
                    "undefined", "span", "objectBox-undefined");

                taskList.push(FBTest.executeCommandAndVerify, "emptyObject.%blah",
                    "Error: missing closure", "span", "errorMessage");
                taskList.push(FBTest.executeCommandAndVerify, "a.%local.%blah",
                    "TypeError: can't get scope of non-object", "span", "errorMessage");

                taskList.push(FBTest.executeCommandAndVerify, "innerA.%b",
                    "2", "span", "objectBox-number");
                taskList.push(FBTest.executeCommandAndVerify, "innerB.%a",
                    "1", "span", "objectBox-number");

                // Test setting
                taskList.push(FBTest.executeCommandAndVerify, "a.%nonExistent = 1",
                    "Error: can't create new closure variable", "span", "errorMessage");
                taskList.push(FBTest.executeCommandAndVerify, "a.%unused = 1",
                    "Error: can't set optimized-away closure variable", "span", "errorMessage");
                taskList.push(FBTest.executeCommandAndVerify, "delete a.%unused",
                    "Error: can't delete closure variable", "span", "errorMessage");
                taskList.push(FBTest.executeCommandAndVerify, "++a.%local",
                    "6", "span", "objectBox-number");

                taskList.push(FBTest.executeCommandAndVerify, "emptyObject.%blah = 1",
                    "Error: missing closure", "span", "errorMessage");

                // Verify the setting
                taskList.push(FBTest.executeCommandAndVerify, "a.%unused",
                    "(optimized away)", "span", "objectBox-optimizedAway");
                taskList.push(FBTest.executeCommandAndVerify, "a.%local",
                    "6", "span", "objectBox-number");

                // Test that error sources are faked
                taskList.push(FBTest.executeCommandAndVerify, "innerA.%a()",
                    "TypeError: <get closure>(...).a is not a function", "span", "errorMessage");
                taskList.push(FBTest.executeCommandAndVerify, "innerA.%a()",
                    "innerA.%a()", "pre", "errorSourceCode");
                taskList.push(FBTest.executeCommandAndVerify, "a.%nonExistent = 1",
                    "a.%nonExistent = 1", "pre", "errorSourceCode");

                // Test object->function heuristics:
                // * already a function
                taskList.push(FBTest.executeCommandAndVerify, "func.%priv",
                    "1", "span", "objectBox-number");
                // * already a function, but would need scope anyway
                taskList.push(FBTest.executeCommandAndVerify, "scopelessFunc.%priv",
                    "Error: missing closure", "span", "errorMessage");
                // * use of own functions
                taskList.push(FBTest.executeCommandAndVerify, "funcWithProto.prototype.%priv",
                    "10", "span", "objectBox-number");
                // * use of own "constructor"
                taskList.push(FBTest.executeCommandAndVerify, "func.prototype.%priv",
                    "1", "span", "objectBox-number");
                // * use of inherited functions
                taskList.push(FBTest.executeCommandAndVerify, "new funcWithProto().%priv",
                    "10", "span", "objectBox-number");
                // * use of "constructor"
                taskList.push(FBTest.executeCommandAndVerify, "new func().%priv",
                    "1", "span", "objectBox-number");

                // Test completion
                taskList.push(testCompletion, "new func().%pr", true);
                taskList.push(testCompletion, "func.prototype.%", true);
                taskList.push(testCompletion, "func.%priv.toP", true);
                taskList.push(testCompletion, "func.%oth.%u", true);
                taskList.push(testCompletion, "func.%oth.reg", true);
                taskList.push(testCompletion, "new func.%oth().%u", true);

                taskList.push(verifyParsing);

                taskList.push(testInDebugger);

                // Run!
                taskList.run(function()
                {
                    FBTest.testDone();
                }, 0)
            });
        });
    });
}
