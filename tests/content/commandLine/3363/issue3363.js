function runTest()
{
    FBTest.sysout("issue3363.START");
    FBTest.openNewTab(basePath + "commandLine/3363/issue3363.html", function(win)
    {
        FBTest.openFirebug();
        FBTest.enableConsolePanel(function(win)
        {
            var config = {
                tagName: "div",
                classes: "logRow logRow-group logGroup",
                counter: 5
            };

            FBTest.waitForDisplayedElement("console", config, function(row)
            {
                var panelNode = FBTest.getPanel("console").panelNode;

                var openedGroups = panelNode.querySelectorAll(".logGroup.opened");
                FBTest.compare(0, openedGroups.length, "There must not be opened groups");

                var groups = panelNode.querySelectorAll(
                    ".panelNode > .logGroup > .logGroupLabel > .objectBox-text");

                if (FBTest.compare(5, groups.length, "There must be 5 logs (groups)"))
                {
                    FBTest.compare("group1", groups[0].textContent, "The title must match");
                    FBTest.compare("group2", groups[1].textContent, "The title must match");
                    FBTest.compare("group3", groups[2].textContent, "The title must match");
                    FBTest.compare("group4", groups[3].textContent, "The title must match");
                    FBTest.compare("group5", groups[4].textContent, "The title must match");
                }

                FBTest.testDone("issue3363.DONE");
            });

            // xxxHonza: the method uses internaly sendChare to type the
            // command char by char. But, the command is this case is too long
            // and it causes timout.
            //FBTest.executeCommand(command);

            // xxxHonza: Set the text directly, there could be better FBTest API for it.
            FBTest.clearCommand();
            var cmdLine = FW.Firebug.CommandLine.getSingleRowCommandLine();
            cmdLine.value = command;
            FBTest.sendKey("RETURN", "fbCommandLine");
        });
    });
}

var command =
    "console.clear();\n" +
    "console.groupCollapsed('group1');\n" +
    "console.log('');\n" +
    "console.log('');\n" +
    "console.log('');\n" +
    "console.log('');\n" +
    "console.groupEnd();\n" +
    "console.groupCollapsed('group2');\n" +
    "console.log('');\n" +
    "console.groupEnd();\n" +
    "console.groupCollapsed('group3');\n" +
    "console.log('');\n" +
    "console.log('');\n" +
    "console.log('');\n" +
    "console.log('');\n" +
    "console.groupEnd();\n" +
    "console.groupCollapsed('group4');\n" +
    "console.info('');\n" +
    "console.log('');\n" +
    "console.info('');\n" +
    "console.log('');\n" +
    "console.info('');\n" +
    "console.log('');\n" +
    "console.info('');\n" +
    "console.log('');\n" +
    "console.info('');\n" +
    "console.log('');\n" +
    "console.info('');\n" +
    "console.log('');\n" +
    "console.info('');\n" +
    "console.log('');\n" +
    "console.info('');\n" +
    "console.log('');\n" +
    "console.info('');\n" +
    "console.log('');\n" +
    "console.groupEnd();\n" +
    "console.groupCollapsed('group5');\n" +
    "console.info('');\n" +
    "console.groupEnd();";
