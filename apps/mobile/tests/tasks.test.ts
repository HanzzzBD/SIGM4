import {describe,expect,it} from "vitest";
import {taskDestination,taskSections} from "../src/features/tasks/model.js";
describe("UX-018 actionable task destinations",()=>{
 it("keeps supported detail actions native and hands unsupported tasks to the trusted school web",()=>{
  expect(taskDestination("workorder",{"workorder.execute":"assigned"},"https://school.test","12")).toEqual({native:"/work-order/12"});
  expect(taskDestination("handover",{"loan.manage":"all"},"https://school.test/unused")).toEqual({web:"https://school.test/peminjaman/serah-terima"});
  expect(taskDestination("returns",{"loan.manage":"all"},"https://school.test")).toEqual({web:"https://school.test/peminjaman"});
 });
 it("rejects insecure origins, unsupported kinds, foreign URLs and missing permissions",()=>{
  for(const origin of ["javascript:alert(1)","http://school.test","https://user:pass@school.test",""])expect(taskDestination("handover",{"loan.manage":"all"},origin)).toBeNull();
  expect(taskDestination("approval",{},"https://school.test","1")).toBeNull();
  expect(taskDestination("workorder",{"workorder.execute":"assigned"},"https://school.test","//evil.test")).toBeNull();
  expect(taskDestination("https://evil.test",{"loan.manage":"all"},"https://school.test")).toBeNull();
 });
 it("every advertised task has a destination for its permissions",()=>{
  const permissions={"workorder.execute":"assigned","loan.manage":"all","audit.execute":"assigned","approval.decide":"assigned","damage.verify":"all","damage.view":"all"};
  for(const item of taskSections(permissions))expect(taskDestination(item.kind,permissions,"https://school.test")).not.toBeNull();
  for(const permission of ["reservation.view","loan.view","fine.view"])for(const item of taskSections({[permission]:"own"}))expect(taskDestination(item.kind,{[permission]:"own"},"https://school.test")).not.toBeNull();
 });
});
