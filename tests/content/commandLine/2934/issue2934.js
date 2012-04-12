function runTest()
{
    FBTest.sysout("issue2934.START");
    FBTest.openNewTab(basePath + "commandLine/2934/issue2934.html", function(win)
    {
        FBTest.openFirebug();
        FBTest.selectPanel("console");
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
            FBTest.executeCommand("aaaaaaaaaaaaaaaaBBBBBBBBBBBBBBBBB = 1; aaaaaaaaaaaaaaaaKKKKKKKKKKKKKKKKKKKKKK = 2; aaaaaaaaaaaaaaaaZZTop = 3;");
            FBTest.typeCommand('a');
            FBTest.typeCommand('a');
            FBTest.synthesizeKey("VK_TAB", null, win);
            FBTest.compare("aaaaaaaaaaaaaaaaZZTop", cmdLine.value,"The command line must display 'aaaaaaaaaaaaaaaaZZTop' after tab key completion.");

            FBTest.sendKey("ESCAPE", "fbCommandLine");  // revert with escape
            FBTest.compare("aa", cmdLine.value, "The command line must display 'aa', the original typing, after escape key");
            FBTest.sendKey("ESCAPE", "fbCommandLine"); // hide completions with escape

            FBTest.compare("aa", cmdLine.value, "The command line must still display 'aa', after escape key");
            FBTest.compare("aa", completionBox.value, "There must be no completions.");

            FBTest.typeCommand('a');
            FBTest.typeCommand('a');
            FBTest.compare("aaaa", completionBox.value, "Completions must still be hidden after typing 'aa'.");

            FBTest.sendKey("ESCAPE", "fbCommandLine"); // clear by escape

            FBTest.compare("", cmdLine.value, "The command line must be cleared after escape key");

            FBTest.typeCommand('a');
            FBTest.typeCommand('a');
            FBTest.sendKey("UP", "fbCommandLine");
            FBTest.synthesizeKey("VK_TAB", null, win);
            FBTest.compare("aaaaaaaaaaaaaaaaKKKKKKKKKKKKKKKKKKKKKK", cmdLine.value, "The command line must display 'aaaaaaaaaaaaaaaaKKKKKKKKKKKKKKKKKKKKKK' after up arrow key");
            FBTest.sendKey("ESCAPE", "fbCommandLine");
            FBTest.sendKey("ESCAPE", "fbCommandLine");
            FBTest.sendKey("ESCAPE", "fbCommandLine");  // clear by escape three times

            FBTest.typeCommand('a');
            FBTest.typeCommand('a');
            FBTest.sendKey("DOWN", "fbCommandLine");
            FBTest.synthesizeKey("VK_TAB", null, win);
            FBTest.compare("aaaaaaaaaaaaaaaaBBBBBBBBBBBBBBBBB", cmdLine.value, "The command line must display 'aaaaaaaaaaaaaaaaBBBBBBBBBBBBBBBBB' after up arrow key");

            FBTest.sendKey("DOWN", "fbCommandLine");  // clear by down arrow
            FBTest.compare("", cmdLine.value, "The command line must be empty after down arrow key");

            FBTest.typeCommand('aa');
            FBTest.sendKey("RIGHT", "fbCommandLine");
            FBTest.compare("aaaaaaaaaaaaaaaaZZTop", cmdLine.value,"The command line must display 'aaaaaaaaaaaaaaaaZZTop' after right arrow completion.");

            FBTest.sendKey("DOWN", "fbCommandLine");  // clear by down arrow

            FBTest.testDone("issue2934.DONE");
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
