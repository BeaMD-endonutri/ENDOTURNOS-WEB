import { jsPDF } from 'jspdf'
import { addDays,endOfMonth,format,parseISO,startOfMonth } from 'date-fns'
import { es } from 'date-fns/locale'
import type { Assignment,Consultation,Staff } from '../types'
import { HOLIDAYS } from '../data/constants'
export function createRotaPdf(month:string,staff:Staff[],assignments:Assignment[],consultations:Consultation[],updatedAt:Date=new Date()) {
 const doc=new jsPDF({orientation:'landscape',unit:'mm',format:'a3'});const margin=12;const width=396;const nameWidth=43;const dates:string[]=[]
 for(let d=startOfMonth(parseISO(month+'-01'));d<=endOfMonth(d)&&format(d,'yyyy-MM')===month;d=addDays(d,1))dates.push(format(d,'yyyy-MM-dd'))
 const cellWidth=(width-nameWidth)/dates.length;let y=34;let page=1
 const heading=()=>{doc.setFillColor('#245e46');doc.rect(0,0,420,23,'F');doc.setTextColor('#ffffff');doc.setFont('helvetica','bold');doc.setFontSize(19);doc.text(`EndoTurnos | ${format(parseISO(month+'-01'),'MMMM yyyy',{locale:es})}`,margin,14);doc.setFont('helvetica','normal');doc.setFontSize(9);doc.setTextColor('#496153');doc.text(`${staff.length===1?staff[0].display_name:'Cuadrante del equipo'} · Actualizado ${format(updatedAt,'dd/MM/yyyy HH:mm')}`,margin,29);y=34;doc.setFillColor('#e5eee5');doc.rect(margin,y,width,14,'F');doc.setFont('helvetica','bold');doc.setFontSize(9);doc.text('Profesional',margin+3,y+8);dates.forEach((date,i)=>{const x=margin+nameWidth+i*cellWidth;doc.setFontSize(7);doc.text(format(parseISO(date),'EEE',{locale:es}).slice(0,2),x+cellWidth/2,y+5,{align:'center'});doc.setFontSize(9);doc.text(date.slice(-2),x+cellWidth/2,y+10,{align:'center'})});y+=14}
 const footer=()=>{doc.setTextColor('#647368');doc.setFont('helvetica','normal');doc.setFontSize(8);doc.text(`Uso interno · Los cambios posteriores no aparecen en esta copia.`,margin,288);doc.text(`Página ${page}`,408,288,{align:'right'})}
 heading()
 for(const person of staff){const perDay=dates.map(date=>assignments.filter(a=>a.work_date===date&&a.professional_id===person.id));const maxRows=Math.max(1,...perDay.map(a=>a.length));const rowHeight=Math.max(17,maxRows*11+4)
 if(y+rowHeight>254){footer();doc.addPage();page++;heading()}
 doc.setDrawColor('#d6e0d5');doc.setLineWidth(.2);doc.setFillColor('#f2f6ef');doc.rect(margin,y,nameWidth,rowHeight,'FD');doc.setTextColor('#254c37');doc.setFont('helvetica','bold');doc.setFontSize(8);const names=doc.splitTextToSize(person.display_name,nameWidth-5);doc.text(names,margin+2,y+6);if(person.weekly_minutes<2100){doc.setFont('helvetica','normal');doc.setFontSize(7);doc.text('Reducción 1/3',margin+2,y+rowHeight-3)}
 dates.forEach((date,i)=>{const x=margin+nameWidth+i*cellWidth;const weekend=[0,6].includes(parseISO(date).getDay());doc.setFillColor(HOLIDAYS[date]?'#fae8e0':weekend?'#f2f3ef':'#ffffff');doc.rect(x,y,cellWidth,rowHeight,'FD');perDay[i].forEach((a,j)=>{const c=consultations.find(c=>c.id===a.consultation_id);const top=y+2+j*11;doc.setFillColor(c?.color??'#50755a');doc.roundedRect(x+.6,top,cellWidth-1.2,5,.8,.8,'F');doc.setTextColor('#ffffff');doc.setFont('helvetica','bold');doc.setFontSize(7.5);doc.text(`${c?.short_label??a.consultation_id.slice(0,5)}${a.provisional?'*':''}`,x+cellWidth/2,top+3.5,{align:'center'});doc.setTextColor('#354c3e');doc.setFont('helvetica','normal');doc.setFontSize(5.8);doc.text(`${a.start_time.slice(0,5)}-${a.end_time.slice(0,5)}`,x+cellWidth/2,top+8.2,{align:'center'})})});y+=rowHeight}
 y+=9;doc.setTextColor('#365340');doc.setFont('helvetica','bold');doc.setFontSize(9);doc.text('Leyenda',margin,y);y+=5
 for(const c of consultations){const text=`${c.short_label}: ${c.label}`;const lines=doc.splitTextToSize(text,180);if(y+lines.length*4>274){footer();doc.addPage();page++;y=18}doc.setFillColor(c.color);doc.rect(margin,y-2.7,3,3,'F');doc.setFont('helvetica','normal');doc.setFontSize(8);doc.text(lines,margin+5,y);y+=Math.max(5,lines.length*4)}
 if(y+14>279){footer();doc.addPage();page++;y=18}doc.setFontSize(8);doc.text('* Turno provisional. Fondo salmón: festivo. Las celdas vacías indican ausencia de asignación.',margin,y+5);footer()
 return doc
}
export function downloadRotaPdf(month:string,staff:Staff[],assignments:Assignment[],consultations:Consultation[],updatedAt:Date){createRotaPdf(month,staff,assignments,consultations,updatedAt).save(`EndoTurnos_${month}_${staff.length===1?'individual':'equipo'}.pdf`)}
