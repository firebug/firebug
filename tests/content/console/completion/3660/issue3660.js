function runTest()
{
    FBTest.setPref("commandLineShowCompleterPopup", true);
    FBTest.openNewTab(basePath + "console/completion/3660/issue3660.html", function(win)
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

                var pageSize = 40, paddingSize = 2;

                function waitForOpen(callback)
                {
                    if (popup.state === "open")
                        callback();
                    else
                        setTimeout(waitForOpen, 10, callback);
                }

                function propIndex()
                {
                    return +completionBox.value.substr("a100.prop".length);
                }

                function findIndex()
                {
                    var el = popup.querySelector("div[selected=true]"), count = 0;
                    for (;;)
                    {
                        el = el.previousSibling;
                        if (!el)
                            break;
                        if (el.classList.contains("completionLine"))
                            ++count;
                    }
                    return count;
                }

                function sendScroll(element, lines)
                {
                    var doc = element.ownerDocument, win = doc.defaultView;
                    var ev = doc.createEvent("MouseScrollEvents");
                    ev.initMouseEvent("DOMMouseScroll", true, true, win, lines,
                            0, 0, 0, 0, false, false, false, false, 0, null);
                    element.dispatchEvent(ev);
                }

                function testSize(callback, expr, size)
                {
                    FBTest.typeCommand(expr);

                    var runs = 0;
                    waitForOpen(function()
                    {
                        if (runs++)
                            return;
                        FBTest.ok(true, "The completion popup should be opened.");
                        var count = popup.getElementsByClassName("completionLine").length;
                        FBTest.compare(size, count, "The completion popup must contain " + size + " rows.");
                        cmdLine.value = "";
                        callback();
                    });

                    setTimeout(function()
                    {
                        if (runs++)
                            return;
                        FBTest.ok(false, "The completion popup should be opened.");
                        FBTest.testDone();
                    }, 1000);
                }

                function testPaging(callback)
                {
                    var topPage = paddingSize, bottomPage = pageSize - paddingSize - 1;

                    FBTest.progress("Testing page up/page down/home/end.");

                    FBTest.typeCommand("a100.");
                    var ind = 0;
                    FBTest.compare(ind, propIndex(), "The first element must be selected...");
                    FBTest.compare(0, findIndex(), "... and be at scroll position 0.");

                    FBTest.synthesizeKey("VK_DOWN", null, win);
                    ++ind;
                    FBTest.compare(ind, propIndex(), "The second element must be selected...");
                    FBTest.compare(1, findIndex(), "... and be at scroll position 1.");

                    FBTest.synthesizeKey("VK_PAGE_DOWN", null, win);
                    ind = bottomPage;
                    FBTest.compare(ind, propIndex(), "The element just above the bottom padding must be selected...");
                    FBTest.compare(bottomPage, findIndex(), "... and be at that scroll position.");

                    FBTest.synthesizeKey("VK_PAGE_DOWN", null, win);
                    ind += pageSize;
                    FBTest.compare(ind, propIndex(), "The element one page down must be selected...");
                    FBTest.compare(bottomPage, findIndex(), "... and be at the same scroll position.");

                    FBTest.synthesizeKey("VK_PAGE_DOWN", null, win);
                    ind = 99;
                    FBTest.compare(ind, propIndex(), "The last element must be selected...");
                    FBTest.compare(pageSize - 1, findIndex(), "... and be at the bottom scroll position.");

                    FBTest.synthesizeKey("VK_PAGE_UP", null, win);
                    ind = 100 - pageSize + paddingSize;
                    FBTest.compare(ind, propIndex(), "The element just below the bottom padding must be selected...");
                    FBTest.compare(topPage, findIndex(), "... and be at that scroll position.");

                    FBTest.synthesizeKey("VK_PAGE_UP", null, win);
                    ind -= pageSize;
                    FBTest.compare(ind, propIndex(), "The element one page up must be selected...");
                    FBTest.compare(topPage, findIndex(), "... and be at the same scroll position.");

                    FBTest.synthesizeKey("VK_UP", null, win);
                    --ind;
                    FBTest.compare(ind, propIndex(), "The previous element must be selected...");
                    FBTest.compare(topPage, findIndex(), "... and be at the same scroll position.");

                    FBTest.synthesizeKey("VK_DOWN", null, win);
                    ++ind;
                    FBTest.compare(ind, propIndex(), "The next element must be selected...");
                    FBTest.compare(topPage + 1, findIndex(), "... and be just below the previous scroll position.");

                    FBTest.synthesizeKey("VK_HOME", null, win);
                    FBTest.compare(0, propIndex(), "The top element must be selected...");
                    FBTest.compare(0, findIndex(), "... and be at scroll position 0.");

                    FBTest.synthesizeKey("VK_END", null, win);
                    FBTest.compare(99, propIndex(), "The bottom element must be selected...");
                    FBTest.compare(pageSize - 1, findIndex(), "... and be at the bottom scroll position.");

                    FBTest.synthesizeKey("VK_PAGE_DOWN", null, win);
                    FBTest.compare(99, propIndex(), "The bottom element must still be selected.");

                    cmdLine.value = "";
                    callback();
                }

                function testMouse1(callback)
                {
                    FBTest.progress("Testing click/scroll.");

                    FBTest.typeCommand("a10.");

                    waitForOpen(function()
                    {
                        var title = popup.querySelector(".fbPopupTitle");
                        FBTest.click(title);
                        FBTest.compare("open", popup.state, "The popup must still be open after clicking the title.");

                        var lastVisible = popup.querySelector("div:last-child");
                        FBTest.click(lastVisible);
                        FBTest.compare("closed", popup.state, "The popup must be closed after clicking a completion.");
                        FBTest.compare("a10.prop9", cmdLine.value, "Should complete to a10.prop9.");

                        cmdLine.value = "";
                        callback();
                    });
                }

                function testMouse2(callback)
                {
                    FBTest.typeCommand("a100.");
                    waitForOpen(function()
                    {
                        // The popup is recreated in each step, so use a helper function
                        // for fetching arbitrary elements to scroll at.
                        function any()
                        {
                            return popup.querySelector("div:last-child");
                        }

                        var lastVisible = popup.querySelector("div:last-child");
                        FBTest.mouseDown(lastVisible);

                        FBTest.compare("open", popup.state, "The popup must still be open after mousedown.");
                        FBTest.compare(pageSize - 1, propIndex(), "The last visible element must be selected...");
                        FBTest.compare(pageSize - 1, findIndex(), "... and it must be positioned at the bottom.");

                        FBTest.synthesizeKey("VK_PAGE_DOWN", null, win);
                        var ind = pageSize*2 - paddingSize - 1;
                        FBTest.compare(pageSize*2 - paddingSize - 1, propIndex(), "Page Down should scroll by a whole page.");

                        sendScroll(any(), 3);
                        FBTest.compare(ind + 3, propIndex(), "Mouse wheel should scroll the selection.");

                        sendScroll(any(), -3);
                        FBTest.compare(ind, propIndex(), "It should be possible to scroll backwards.");

                        FBTest.synthesizeKey("VK_END", null, win);
                        sendScroll(any(), 3);
                        FBTest.compare(99, propIndex(), "It should not be possible to scroll across edges.");

                        var title = popup.querySelector(".fbPopupTitle");
                        sendScroll(title, -3);
                        FBTest.compare(99, propIndex(), "Scrolling the title should do nothing.");

                        cmdLine.value = "";
                        callback();
                    });
                }

                var tasks = new FBTest.TaskList();
                tasks.push(testSize, "a10.", 10);
                tasks.push(testSize, "a100.", pageSize);
                tasks.push(testPaging);
                tasks.push(testMouse1);
                tasks.push(testMouse2);

                tasks.run(function()
                {
                    FBTest.testDone();
                }, 0);
            });
        });
    });
}
