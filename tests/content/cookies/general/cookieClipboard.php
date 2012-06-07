<?php
    setcookie("CopyPasteCookie", "Test Cookie Value", 1565778363, "/dir", "", false);
?>

<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.0 Transitional//EN">
<html>
<head>
    <title>Cookie Clipboard</title>
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8"/>
    <link rel="stylesheet" href="../tests.css" type="text/css"/>
</head>
<body>

<h1>Cookie Clipboard</h1>
<i>Jan Odvarko, odvarko@gmail.com</i>

<ol>
<li>Open Firebug, enable Cookies panel and refresh this page.</li>
<li>Right click on the <i>CopyPasteCookies</i> and pick <b>Copy</b>.</li>
<li>Right again and pick <b>Paste</b>.</li>
<li>Except of the name (should have  <code>-1</code> suffix) the new cookie should have
the same values.</li>
</ol>

</body>
</html>
