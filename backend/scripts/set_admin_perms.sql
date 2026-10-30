UPDATE User SET permissions='user,flightplan,event,controller,staff,ticket,online' WHERE cid='0000' OR cid='5966';
SELECT cid,rating,permissions FROM User WHERE cid IN ('0000','5966');
