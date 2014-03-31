function runTest()
{
    FBTest.openNewTab(basePath + "script/4213/issue4213.html", function(win)
    {
        FBTest.selectPanel("script");
        FBTest.enableScriptPanel(function(win)
        {
            var panel = FW.Firebug.chrome.getSelectedPanel();
            FBTest.compare("script", panel.name, "Got selected panel " + panel.name);

            var lineNo = 22;
            var fileUrl = basePath + "script/4213/issue4213.html";
            FBTest.setBreakpoint(null, fileUrl, lineNo, null, function()
            {
                FBTest.waitForBreakInDebugger(null, lineNo, true, function hitBP()
                {
                    verifyLocation("issue4213.html");

                    stepInto(function hitNextBreak()
                    {
                        verifyLocation("issue4213-1.js");
                        FBTest.testDone();
                    });
                });

                FBTest.click(win.document.getElementById("testButton"));
            })
        });
    })
}

function verifyLocation(expected)
{
    var currenLocation = getCurrentLocation();
    FBTest.compare(expected, currenLocation, "The location is: " + currenLocation);
}

//xxxHonza: will be part of FBTest 1.7b14
function getCurrentLocation()
{
    var locationList = FW.Firebug.chrome.$("fbLocationList");
    return locationList.label;
};

//xxxHonza: this should be generic and part of FBTest
function stepInto(callback)
{
    var lineNo = 3;
    var fileUrl = basePath + "script/4213/issue4213-1.js";
    FBTest.waitForBreakInDebugger(null, lineNo, false, function hitBreak()
    {
        callback();
    });

    FBTest.clickToolbarButton(FW.Firebug.chrome, "fbStepIntoButton");
}
