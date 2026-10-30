UPDATE User SET rating = 12 WHERE cid = '5966';
UPDATE User SET rating = 12 WHERE cid = '0000';
select cid,username,role,rating from User where cid in ('5966','0000');
