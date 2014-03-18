function runTest()
{
    FBTest.openNewTab(basePath + "commandLine/3363/issue3363.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            FBTest.enableConsolePanel(function(win)
            {
                var config = {
                    tagName: "div",
                    classes: "logRow logRow-group",
                    counter: 5
                };

                FBTest.waitForDisplayedElement("console", config, function(row)
                {
                    var panelNode = FBTest.getSelectedPanel().panelNode;

                    var openedGroups = panelNode.getElementsByClassName("logGroup opened");
                    FBTest.compare(0, openedGroups.length, "There must not be opened groups");

                    var groups = panelNode.querySelectorAll(".logGroupLabel > .objectBox-text");

                    if (FBTest.compare(5, groups.length, "There must be 5 groups"))
                    {
                        for (var i = 0, len = groups.length; i < len; ++i)
                        {
                            FBTest.compare("Group " + (i+1), groups[i].textContent,
                                "The title of group " + (i+1) + " must match");
                        }
                    }

                    FBTest.testDone();
                });

                FBTest.click(win.document.getElementById("createLogGroups"));
            });
        });
    });
}
