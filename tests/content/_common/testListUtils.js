/* See license.txt for terms of usage */

// **********************************************************************************************//
// Constants

/**
 * Convert list of test (JS array) into a nice HTML markup.
 * xxxHonza: I'd like to use a domplate module (requirejs) + a nice template
 * that renders the JS array with tests.
 */
window.addEventListener("load", function showPage()
{
    // If the file is loaded into the Firebug test console don't
    // generate the web UI.
    if (document.getElementById("testList"))
        return;

    var d = document.getElementById("driverURI");
    if (d)
        d.innerHTML = driverBaseURI;

    var t = document.getElementById("testcaseURI");
    if (t)
        t.innerHTML = serverURI;

    var cases = document.getElementById("tests");
    var currentGroup = null;
    for(var i = 0; i < testList.length; i++)
    {
        var testCase = testList[i];
        var ul;

        if (testCase.group != currentGroup)
        {
            currentGroup = testCase.group;
            var h3 = document.createElement("h3");

            // Capitalize the first letter.
            h3.innerHTML = currentGroup.charAt(0).toUpperCase() +
                currentGroup.substr(1).toLowerCase();

            var anchor = document.createElement("a");
            anchor.setAttribute("name", currentGroup);
            cases.appendChild(anchor);
            cases.appendChild(h3);

            ul = document.createElement("ul");
            cases.appendChild(ul);
        }

        var entry = document.createElement("li");
        var uri = testCase.testPage ? testCase.testPage : testCase.uri;
        entry.innerHTML += "<a href=" + driverBaseURI + uri + ">" +
            testCase.desc + "</a>";

        if (!testCase.testPage)
            entry.innerHTML += "<span class='noTestCasePage'>(driver only)</span>";

        ul.appendChild(entry);
    }
}, true);

// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

function getDriverBaseURI()
{
    var loc = window.location.toString();

    // Remove anchor
    var index = loc.indexOf("#");
    if (index >= 0)
        loc = loc.substring(0, index);

    var parts = loc.split("/");
    parts.pop(); // remove file name
    return parts.join("/") + "/";
}
