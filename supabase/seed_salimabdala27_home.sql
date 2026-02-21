-- Seed one default home with initial 14 fuses for:
-- salimabdala27@hotmail.com
-- Run in Supabase SQL Editor.

with target_user as (
  select id
  from auth.users
  where email = 'salimabdala27@hotmail.com'
  limit 1
),
seed_state as (
  select
    id as user_id,
    jsonb_build_object(
      'homes',
      jsonb_build_array(
        jsonb_build_object(
          'id', 'home1',
          'name', 'My Home',
          'fuses', jsonb_build_array(
            jsonb_build_object('id','fuse1','number',1,'rating','B6'),
            jsonb_build_object('id','fuse2','number',2,'rating','B32'),
            jsonb_build_object('id','fuse3','number',3,'rating','B6'),
            jsonb_build_object('id','fuse4','number',4,'rating','B16'),
            jsonb_build_object('id','fuse5','number',5,'rating','B32'),
            jsonb_build_object('id','fuse6','number',6,'rating','B6'),
            jsonb_build_object('id','fuse7','number',7,'rating','B32'),
            jsonb_build_object('id','fuse8','number',8,'rating','B32'),
            jsonb_build_object('id','fuse9','number',9,'rating','B40'),
            jsonb_build_object('id','fuse10','number',10,'rating','B16'),
            jsonb_build_object('id','fuse11','number',11,'rating','B6'),
            jsonb_build_object('id','fuse12','number',12,'rating','B6'),
            jsonb_build_object('id','fuse13','number',13,'rating','B6'),
            jsonb_build_object('id','fuse14','number',14,'rating','B32')
          ),
          'rooms', jsonb_build_array(
            jsonb_build_object('id','entrance','name','Entrance','lightsFuseId','fuse1','socketsFuseId','fuse2'),
            jsonb_build_object('id','downstairsBathroom','name','Downstairs Bathroom','lightsFuseId','fuse3','socketsFuseId','fuse4'),
            jsonb_build_object('id','livingRoom','name','Living Room','lightsFuseId','fuse5','socketsFuseId','fuse6'),
            jsonb_build_object('id','kitchen','name','Kitchen','lightsFuseId','fuse7','socketsFuseId','fuse8'),
            jsonb_build_object('id','outsideLights','name','Outside Lights','lightsFuseId','fuse9','socketsFuseId',null),
            jsonb_build_object('id','secondFloorLanding','name','Second Floor Landing','lightsFuseId','fuse10','socketsFuseId','fuse2'),
            jsonb_build_object('id','upstairsToilet','name','Upstairs Toilet','lightsFuseId','fuse11','socketsFuseId','fuse4'),
            jsonb_build_object('id','upstairsBathroom','name','Upstairs Bathroom','lightsFuseId','fuse12','socketsFuseId','fuse8'),
            jsonb_build_object('id','alishaBedroom','name','Alisha Bedroom','lightsFuseId','fuse13','socketsFuseId','fuse14'),
            jsonb_build_object('id','mumsBedroom','name','Mum''s Bedroom','lightsFuseId','fuse13','socketsFuseId','fuse14'),
            jsonb_build_object('id','office','name','Office','lightsFuseId','fuse11','socketsFuseId','fuse6'),
            jsonb_build_object('id','myBedroom','name','My Bedroom','lightsFuseId','fuse12','socketsFuseId','fuse14')
          ),
          'breakers', jsonb_build_object(
            'fuse1', true,
            'fuse2', true,
            'fuse3', true,
            'fuse4', true,
            'fuse5', true,
            'fuse6', true,
            'fuse7', true,
            'fuse8', true,
            'fuse9', true,
            'fuse10', true,
            'fuse11', true,
            'fuse12', true,
            'fuse13', true,
            'fuse14', true
          ),
          'nextFuseNumber', 15
        )
      ),
      'activeHomeId', 'home1'
    ) as state
  from target_user
)
insert into public.user_home_configs (user_id, state, updated_at)
select user_id, state, now()
from seed_state
on conflict (user_id)
do update set
  state = excluded.state,
  updated_at = now();

-- Optional verification:
-- select user_id, state
-- from public.user_home_configs
-- where user_id = (select id from auth.users where email = 'salimabdala27@hotmail.com');
