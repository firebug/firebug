<?php
    setcookie("TestCookie25", "ValueCookie25", time() + 60*60*24*30, "/firecookie", "", false);
?>

<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.0 Transitional//EN">
<html>
<head>
    <title>Issue 25: Changing expire time to Session deletes cookie</title>
    <link rel="stylesheet" href="../tests.css" type="text/css"/>
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8"/>
</head>
<body>

<div class="topBar">
    <a href="http://code.google.com/p/firecookie/issues/detail?id=25">Issue 25</a>
</div>
<h1>Issue 25: Changing expire time to Session deletes cookie</h1>
<i>Jan Odvarko, odvarko@gmail.com</i>

<ol>
<li>Open Firebug and select <b>Cookies</b> panel.</li>
<li>Right click on <i>TestCookie25</i> and pick the <b>Edit</b> action.</li>
<li>Check <i>Session</i> checkbox and press OK button.</li>
<li>The cookie should be still presented in the list and marked as <span style="color:green">Session</span>
cookie. (BUG)</li>
<li>Open the edit dialog on this cookie again and uncheck the <i>Session</i> checkbox. Press OK button.</li>
<li>The cookie should be still presented in the list. The <span style="color:green">Session</span>
flag should be removed. (BUG)</li>
</ol>

</body>
</html>
