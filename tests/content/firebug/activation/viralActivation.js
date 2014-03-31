


function viralActivation()
{
    var path = FBTest.getHTTPURLBase()+"firebug/activation/";
    var viralActivationURL = path + "viralActivation.html";

    FBTest.openNewTab(viralActivationURL, function openFirebug(win)
    {
        FBTest.progress("opened tab for "+win.location);

        var isFirebugOpen = FBTest.isFirebugOpen();
        FBTest.ok(!isFirebugOpen, "Firebug starts closed");

        FBTest.openFirebug(function()
        {
            var isFirebugOpen = FBTest.isFirebugOpen();
            FBTest.ok(isFirebugOpen, "Firebug now open");

            if (FBTest.FirebugWindow.Firebug.currentContext)
            {
                var contextName = FBTest.FirebugWindow.Firebug.currentContext.getName();
                FBTest.ok(true, "chromeWindow.Firebug.currentContext "+contextName);
                FBTest.ok(contextName == viralActivationURL, "Firebug.currentContext set to "+viralActivationURL);
            }
            else
            {
                FBTest.ok(false, "no Firebug.currentContext");
            }

            sameTabOpen(win, path);
        });
    });
}

function sameTabOpen(win, path)
{
    var link = win.document.getElementById("sameTabOpen");
    var url = link.getAttribute("href");
    var tabbrowser = FBTest.getBrowser();
    var browser = tabbrowser.getBrowserForTab(tabbrowser.selectedTab);

    function loadedBrowser()
    {
        browser.removeEventListener("load", loadedBrowser, true);
        setTimeout(function checkFBOpen(event)
        {
            FBTest.progress("Entered checkFBOpen");

            var doc = browser.contentWindow.document;
            FBTest.compare(path+url, doc.location.toString(), "The url of the link and the document that opened should match");
            var placement = FBTest.getFirebugPlacement();
            FBTest.compare("inBrowser", placement, "Firebug is placed in browser");
            var suspension = FW.Firebug.getSuspended();
            FBTest.compare(null, suspension, "Firebug is not suspended on "+browser.currentURI.spec);

            FBTest.progress("Go back to the first page");
            browser.contentWindow.back();

            var suspension = FW.Firebug.getSuspended();
            FBTest.compare(null, suspension, "Firebug is not suspended on "+browser.currentURI.spec);
            FBTest.testDone();
        });

    }
    browser.addEventListener("load", loadedBrowser, true);

    FBTest.progress("Click link "+link.getAttribute('id'));
    FBTest.click(link);
}

//------------------------------------------------------------------------
// Auto-run test

function runTest()
{
    FBTest.sysout("Activation.started");
    FBTest.sysout("activation.js FBTest", FBTest);

    if (FBTest.FirebugWindow)
        FBTest.ok(true, "We have the Firebug Window: "+FBTest.FirebugWindow.location);
    else
        FBTest.ok(false, "No Firebug Window");

    // Auto run sequence
    viralActivation();
}
