var frames1 = [
    ["actualTrace", ["arg1=1,", "arg2=2,", "arg3=undefined"], "trace.html", 101],
    ["rec", ["left=0"], "trace.html", 96],
    ["rec", [], "trace.html", 94],
    ["rec", [], "trace.html", 94],
    ["onExecuteTest", [], "trace.html", 88],
    ["onclick", [], "trace.html", 1],
]

var frames2 = [
    ["strictTrace", [], "trace.html", 107],
    ["onclick", [], "trace.html", 1],
]

var frames3 = [
    ["actualTrace", ["arg1=1,", "arg2=2,", "arg3=undefined"], "trace.html", 101],
    ["rec", ["left=0"], "trace.html", 96],
    ["rec", ["left=1"], "trace.html", 94],
    ["rec", ["left=2"], "trace.html", 94],
    ["onExecuteTest", [], "trace.html", 88],
    ["onclick", ["event=click", "clientX=0,", "clientY=0"], "testBu...te Test", 1],
];

function runTest()
{
    FBTest.openNewTab(basePath + "console/api/trace.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            FBTest.enableConsolePanel(function(win)
            {
                compareFrames(frames1, function()
                {
                    compareFrames(frames2, function()
                    {
                        FBTest.enableScriptPanel(function(win)
                        {
                            FBTest.reload(function()
                            {
                                compareFrames(frames3, function()
                                {
                                    FBTest.testDone();
                                });

                                clickContentButton(win, "testButton");
                            })
                        });
                    });

                    clickContentButton(win, "strictButton");
                });

                clickContentButton(win, "testButton");
            });
        });
    });
}

function compareFrames(list, callback)
{
    FBTest.clearConsole();

    var config = {tagName: "div", classes: "logRow logRow-stackTrace"};
    FBTest.waitForDisplayedElement("console", config, function(row)
    {
        FBTest.progress("trace logged");

        var panelNode = FBTest.getPanel("console").panelNode;
        var row = panelNode.querySelector(".logRow-stackTrace");
        if (!row)
           return

        var stackFrames = row.getElementsByClassName("objectBox-stackFrame");

        // xxxHonza: Also frames from the driver are displayed, so there
        // is actually more (not sure if this is a platform bug).
        //FBTest.compare(list.length, stackFrames.length - 1,
        //    "There must be " + list.length + " stack frames.");

        for (var i = 0; i < list.length; i++)
        {
            var entry = list[i];
            var reStack = new RegExp(entry[0] + "\\(" + entry[1].join("\\s*") + "\\)\\s*" +
                FW.FBL.$STRF("Line", [entry[2], entry[3]]).replace(/([\\"'\(\)])/g, "\\$1"));
            FBTest.compare(reStack, stackFrames[i].textContent, "Stack frame text must match.");
        }

        callback();
    });
}

function clickContentButton(win, buttonId)
{
    FBTest.progress("click on " + buttonId);
    FBTest.clickContentButton(win, buttonId);
}
