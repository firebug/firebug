function runTest()
{
    FBTest.openNewTab(basePath + "commandLine/completion/completion.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            FBTest.enableConsolePanel(function(win)
            {
                var doc = FW.Firebug.chrome.window.document;
                var cmdLine = doc.getElementById("fbCommandLine");
                var completionBox = doc.getElementById("fbCommandLineCompletion");

                // Make sure the console is focused and command line API loaded.
                FBTest.focus(cmdLine);
                FBTest.clearCommand();

                FBTest.typeCommand("doc");
                FBTest.synthesizeKey("VK_TAB", null, win);
                FBTest.compare("document", cmdLine.value,"The command line must display 'document' after tab key completion.");

                FBTest.typeCommand(".");
                FBTest.synthesizeKey("VK_BACK_SPACE", null, win);
                FBTest.compare("document", cmdLine.value,"The command line must display 'document' after backspace on 'document.'.");

                FBTest.sendKey("RETURN", "fbCommandLine");  // execute 'document' command
                FBTest.compare("", cmdLine.value,"The command line must display nothing after enter on 'document'.");

                FBTest.sendKey("UP", "fbCommandLine");
                FBTest.compare("document", cmdLine.value, "The command line must display 'document' after uparrow following 'document' command");

                FBTest.sendKey("DOWN", "fbCommandLine");
                FBTest.compare("", cmdLine.value, "The command line must display nothing following down arrow");

                FBTest.sendKey("UP", "fbCommandLine");
                FBTest.compare("document", cmdLine.value, "The command line must display 'document' after uparrow following 'document' command");

                FBTest.sendKey("ESCAPE", "fbCommandLine");
                FBTest.compare("", cmdLine.value, "The command line must display nothing after escape key");

                FBTest.typeCommand("document.id.");
                FBTest.synthesizeKey("VK_TAB", null, win);
                FBTest.compare("document.id.", cmdLine.value,"The command line must display 'document.id.' after tab key completion.");

                FBTest.sendKey("RETURN", "fbCommandLine"); // clear by executing the junk

                checkUncompleted("[{w", win, cmdLine); // issue 3598
                checkUncompleted("a = [{w", win, cmdLine);
                checkUncompleted("a = [{w", win, cmdLine);
                checkUncompleted('a = "w', win, cmdLine);
                checkUncompleted('"w', win, cmdLine);

                checkUncompleted('window.alert("w', win, cmdLine);  // issue 3591
                checkUncompleted('window.alert("whoops").', win, cmdLine);

                checkUncompleted('/hi', win, cmdLine); // issue 3592
                checkUncompleted('/hi/i', win, cmdLine);

                // Issue 3600
                FBTest.executeCommand("aaaaaBBB = 1; aaaaaCCC = 2; aaaaaD = 3;");
                FBTest.typeCommand("a");
                FBTest.typeCommand("a");
                FBTest.synthesizeKey("VK_TAB", null, win);
                FBTest.compare("aaaaaD", cmdLine.value,"The command line must display 'aaaaaaaaaaaaaaaaZZTop' after tab key completion.");

                // Revert completion
                FBTest.sendKey("ESCAPE", "fbCommandLine");
                FBTest.compare("aa", cmdLine.value, "The command line must display 'aa', the original typing, after pressing Escape");
                FBTest.compare("  aaaD", completionBox.value, "The completion suggestion must be 'aaaD' after pressing Escape");

                // Hide completion list popup
                FBTest.sendKey("ESCAPE", "fbCommandLine"); // hide completions with escape
                FBTest.compare("aa", cmdLine.value, "The command line must display 'aa', the original typing, after pressing Escape again");
                FBTest.compare("  aaaD", completionBox.value, "The completion suggestion must be 'aaaD' after pressing Escape");

                // Cancel the auto-completion
                FBTest.sendKey("ESCAPE", "fbCommandLine");
                FBTest.compare("aa", cmdLine.value, "The command line must still display 'aa', after escape key");
                FBTest.compare("", completionBox.value, "There must be no completions.");

                FBTest.typeCommand("a");
                FBTest.typeCommand("a");
                FBTest.compare("", completionBox.value, "Completions must still be hidden after typing 'aa'.");

                FBTest.sendKey("ESCAPE", "fbCommandLine"); // clear by escape

                FBTest.compare("", cmdLine.value, "The command line must be cleared after escape key");

                FBTest.typeCommand("a");
                FBTest.typeCommand("a");
                FBTest.sendKey("UP", "fbCommandLine");
                FBTest.synthesizeKey("VK_TAB", null, win);
                FBTest.compare("aaaaaCCC", cmdLine.value, "The command line must display 'aaaaaCCC' after up arrow key");
                FBTest.sendKey("RETURN", "fbCommandLine");

                FBTest.typeCommand("a");
                FBTest.typeCommand("a");
                FBTest.sendKey("DOWN", "fbCommandLine");
                FBTest.synthesizeKey("VK_TAB", null, win);
                FBTest.compare("aaaaaBBB", cmdLine.value, "The command line must display 'aaaaaBBB' after up arrow key");

                FBTest.sendKey("DOWN", "fbCommandLine");  // clear by down arrow
                FBTest.compare("", cmdLine.value, "The command line must be empty after down arrow key");

                FBTest.typeCommand('aa');
                FBTest.sendKey("RIGHT", "fbCommandLine");
                FBTest.compare("aaaaaD", cmdLine.value,"The command line must display 'aaaaaD' after right arrow completion.");

                FBTest.sendKey("RETURN", "fbCommandLine");

                FBTest.testDone();
            });
        });
    });
}

function checkUncompleted(uncompleted, win, cmdLine)
{
    FBTest.typeCommand(uncompleted);
    FBTest.synthesizeKey("VK_TAB", null, win);
    FBTest.compare(uncompleted, cmdLine.value,"The command line must display "+uncompleted+" after tab key completion.");
    FBTest.sendKey("RETURN", "fbCommandLine"); // clear by executing the junk
}
