function runTest()
{
    FBTest.openNewTab(basePath + "console/3204/issue3204.html", function()
    {
        FBTest.enableConsolePanel(function()
        {
            FBTest.reload(function(win)
            {
                var panel = FBTest.selectPanel("console");
                var logs = panel.panelNode.getElementsByClassName("logRow");

                var expected = [
                    "String placeholder:\nstring",
                    "Number placeholder:\n1",
                    "Float placeholder:\n2",
                    "Object placeholder:\n<body>",
                    "Space before string placeholder:\n string",
                    "Space after placeholder:\nstring ",
                    "Different log message style including string placeholder:\nstring",
                    "Placeholder for debug info:\ndebug info",
                    "Placeholder for info:\ninfo",
                    "Placeholder for warning:\nwarning",
                    "Placeholder for error:\nerror"
                ];

                FBTest.compare(logs.length, expected.length, "There must be " + expected.length +
                    " log(s) in the Console panel");

                for(var i=0; i<logs.length; i++)
                {
                    var logMsg = logs[i].textContent.substring(0,
                        logs[i].textContent.indexOf("issue"));
                    FBTest.compare(expected[i], logMsg,
                        "The placeholders of '" + logMsg + "' must be replaced");
                }

                FBTest.testDone();
            });
        });
    });
}
