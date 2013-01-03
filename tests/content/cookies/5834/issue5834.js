function runTest()
{
    FBTest.sysout("issue5834.START");

    FBTest.openNewTab(basePath + "cookies/5834/issue5834.php", function(win)
    {
        FBTest.openFirebug();
        FBTestFireCookie.enableCookiePanel(function(win)
        {
            FBTest.selectPanel("cookies");

            var tests = [];
            tests.push(short);
            tests.push(shortURLEncoded);
            tests.push(long);
            tests.push(longURLEncoded);

            FBTest.runTestSuite(tests, function()
            {
                FBTest.testDone("issue5834; DONE");
            });
        });
    });
}

function short(callback)
{
    executeTest("TestCookie5834-1", /Size\s*21 B/, callback);
}

function shortURLEncoded(callback)
{
    executeTest("TestCookie5834-2", /Size\s*23 B\s*Raw Size\s*31 B/, callback);
}

function long(callback)
{
    executeTest("TestCookie5834-3", new RegExp("Size\\s*"+((1.2).toLocaleString())+" KB\\s*\\("+
        ((1216).toLocaleString())+" B\\)"), callback);
}

function longURLEncoded(callback)
{
    executeTest("TestCookie5834-4", new RegExp("Size\\s*"+(166).toLocaleString()+
        " B\\s*Raw Size\\s*"+(1.3).toLocaleString()+" KB\\s*\\("+(1366).toLocaleString()+" B\\)"),
        callback);
}

function executeTest(cookieName, expected, callback)
{
    var panelNode = FBTest.getSelectedPanel().panelNode;
    var cookie = FBTestFireCookie.getCookieByName(panelNode, cookieName);
    var sizeCol = cookie.row.getElementsByClassName("cookieRawSizeCol").item(0);

    var config = {tagName: "table", classes: "sizeInfoTip"};
    FBTest.waitForDisplayedElement("cookies", config, function (infoTip)
    {
        FBTest.compare(expected, infoTip.textContent, "The infotip for the '"+cookieName+
            "' cookie must contain the correct values");
        callback();
    });

    FBTest.mouseOver(sizeCol);
}
