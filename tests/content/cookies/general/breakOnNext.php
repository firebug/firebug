<?php
    setcookie("TestCookie50", "CookieValue50", time() + 86400, "/", ".janodvarko.cz", false, false);
?>

<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.0 Transitional//EN">
<html>
<head>
    <title>Break On Next</title>
    <link rel="stylesheet" href="../tests.css" type="text/css"/>
    <script type="text/javascript" src="javascript_cookies.js"></script>
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8"/>
</head>
<body>

<h1>Break on cookie change</h1>
<i>Jan Odvarko, odvarko@gmail.com</i>

<ol>
<li>Open Firebug and enable the <b>Cookies</b> panel.</li>
<li>Click the <code>Break on Cookie Change</code> button.</li>
<li>Click on one of the buttons bellow.</li>
<li>The script execution must be stopped by Firebug debugger and
the propert source code line must be displayed.</li>
</ol>

<button id="addCookie" onclick="onAddCookie()">Add Cookie</button>
<button id="removeCookie" onclick="onRemoveCookie()">Remove Cookie</button>
<button id="changeCookie" onclick="onChangeCookie()">Change Cookie</button>

<script type="text/javascript">
var domain = "";

function onAddCookie()
{
    var time = (new Date()).getTime();
    Set_Cookie("TestCookie50" + time, "Some Value", time + 3600 * 1000,
        "/", domain, false);
}

function onRemoveCookie()
{
    if (!Get_Cookie("TestCookie50"))
    {
        alert("The cookie has been deleted.\nRefresh the page to " +
            "get it from the server again.");
        return;
    }

    Delete_Cookie("TestCookie50", "/", domain);
}

function onChangeCookie()
{
    var time = (new Date()).getTime();

    if (!Get_Cookie("TestCookie50"))
    {
        Set_Cookie("TestCookie50", "Some Value", time + 3600 * 1000,
            "/", domain, false);
        return;
    }

    Set_Cookie("TestCookie50", "New Value: " + time, time + 3600 * 1000,
        "/", domain, false);
}
</script>

</body>
</html>
