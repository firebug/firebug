<?php
    setcookie("TestCookieForBreak", "Test Cookie Value", 1565778363, "/", "", false);
?>

<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.0 Transitional//EN">
<html>
<head>
    <title>Cookie Breakpoint</title>
    <link rel="stylesheet" href="../tests.css" type="text/css"/>
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8"/>
    <script type="text/javascript" src="javascript_cookies.js"></script>
</head>
<body>

<h1>Cookie Breakpoint</h1>
<i>Jan Odvarko, odvarko@gmail.com</i>

<ol>
<li>Open Firebug, enable Cookies panel and refresh this page.</li>
<li>Click on the left <i>Breakpoint Bar</i> (the left hand vertical gray bar)
    to create a breakpoint for <i>TestCookieForBreak</i> cookie.</li>
<li>Click on the button bellow to change the cookie.</li>
<li>Firebug must stop in the debugger.</li>
</ol>

<button onclick="onChangeCookie()">Change Cookie</button>

<script type="text/javascript">
function onChangeCookie()
{
    if (!Get_Cookie("TestCookieForBreak"))
    {
        alert("The 'BreakOnThisCookie' cookie is not available. Bug in the test case?");
        return;
    }

    var time = (new Date()).getTime();
    Set_Cookie("TestCookieForBreak", "New Value: " + time, time + 3600 * 1000,
        "/", "", false);
}
</script>

</body>
</html>
